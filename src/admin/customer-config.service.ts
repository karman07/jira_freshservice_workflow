import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Customer, CustomerDocument } from '../database/schemas/customer.schema';

/**
 * Resolved credentials for a given customer (tenant).
 * Both Jira and Freshservice fields are guaranteed to be non-empty strings
 * because we fall back to global .env defaults when the customer hasn't
 * configured their own credentials.
 */
export interface CustomerConfig {
  customerId: string;
  slug: string;
  name: string;

  // Jira
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;

  // Freshservice Instance A
  freshserviceBaseUrl: string;
  freshserviceApiKey: string;
  fsCustomStatusAwaiting: string;
  fallbackEmail: string;

  // Freshservice Instance B (FS↔FS pairing — optional)
  fsPairEnabled: boolean;
  fs2BaseUrl: string;
  fs2ApiKey: string;
  fs2FallbackEmail: string;

  // Shared FS Dispatcher routing keys (for single-shared-FS multi-tenant mode)
  freshserviceCompanyId?: string;
  freshserviceGroupId?: string;
  freshserviceRoutingTag?: string;

  // Subject-based routing key (highest priority — extracted from "[CUST-X] subject")
  freshserviceCustomerId?: string;
}

/**
 * CustomerConfigService
 * ─────────────────────
 * Single source of truth for credential resolution.
 * Call resolveBySlug(slug) to get the effective credentials for a tenant.
 *
 * Resolution order:
 *   1. Customer's own stored value  (from MongoDB)
 *   2. Global .env default          (FRESHSERVICE_BASE_URL, etc.)
 *   3. Hard-coded safe fallbacks    (empty string / placeholder)
 *
 * This service is the ONLY place where we read from either the DB or env.
 * All other services receive a CustomerConfig object — no raw env reads.
 */
@Injectable()
export class CustomerConfigService {
  private readonly logger = new Logger(CustomerConfigService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolve credentials for a customer identified by slug.
   * Throws NotFoundException if the customer doesn't exist or is inactive.
   */
  async resolveBySlug(slug: string): Promise<CustomerConfig> {
    const customer = await this.customerModel.findOne({ slug }).lean();

    if (!customer) {
      throw new NotFoundException(`Customer "${slug}" not found. Create it in the admin dashboard first.`);
    }

    if (!customer.isActive) {
      throw new NotFoundException(`Customer "${slug}" is disabled. Enable it in the admin dashboard.`);
    }

    return this.buildConfig(customer);
  }

  /**
   * Resolve credentials for a customer by MongoDB _id.
   */
  async resolveById(customerId: string): Promise<CustomerConfig> {
    const customer = await this.customerModel.findById(customerId).lean();

    if (!customer) {
      throw new NotFoundException(`Customer "${customerId}" not found.`);
    }

    return this.buildConfig(customer);
  }

  /**
   * Build the effective config for a customer, falling back to global env.
   */
  private buildConfig(customer: CustomerDocument): CustomerConfig {
    const globalFsUrl   = this.configService.get<string>('FRESHSERVICE_BASE_URL') ?? '';
    const globalFsKey   = this.configService.get<string>('FRESHSERVICE_API_KEY') ?? '';
    const globalFallback = this.configService.get<string>('FALLBACK_EMAIL') ?? '';
    const globalFsCustomStatus = this.configService.get<string>('FS_CUSTOM_STATUS_AWAITING') ?? '';

    const config: CustomerConfig = {
      customerId: customer._id.toString(),
      slug: customer.slug,
      name: customer.name,

      // Jira — always required per-customer
      jiraBaseUrl:     customer.jiraBaseUrl,
      jiraEmail:       customer.jiraEmail,
      jiraApiToken:    customer.jiraApiToken,
      jiraProjectKey:  customer.jiraProjectKey,

      // Freshservice Instance A — fall back to global env if not set
      freshserviceBaseUrl: customer.freshserviceBaseUrl || globalFsUrl,
      freshserviceApiKey:  customer.freshserviceApiKey  || globalFsKey,
      fsCustomStatusAwaiting: customer.fsCustomStatusAwaiting || globalFsCustomStatus,
      fallbackEmail:   customer.fallbackEmail || globalFallback,

      // Freshservice Instance B (FS↔FS pairing)
      fsPairEnabled:   customer.fsPairEnabled ?? false,
      fs2BaseUrl:      customer.fs2BaseUrl ?? '',
      fs2ApiKey:       customer.fs2ApiKey ?? '',
      fs2FallbackEmail: customer.fs2FallbackEmail || globalFallback,

      // Shared FS Dispatcher routing keys
      freshserviceCompanyId:  customer.freshserviceCompanyId ?? undefined,
      freshserviceGroupId:    customer.freshserviceGroupId ?? undefined,
      freshserviceRoutingTag: customer.freshserviceRoutingTag ?? undefined,
      freshserviceCustomerId: customer.freshserviceCustomerId ?? undefined,
    };

    this.logger.debug(
      `🏢 [Config] Resolved for "${customer.slug}": ` +
      `Jira=${config.jiraBaseUrl} | FS-A=${config.freshserviceBaseUrl} | ` +
      `FS-B=${config.fs2BaseUrl || '(global)'} | PairEnabled=${config.fsPairEnabled}`,
    );

    return config;
  }

  /**
   * resolveBySharedFs()
   * Used by the shared Freshservice dispatcher.
   * Matches an incoming ticket to the correct customer using:
   *   1. company_id  (most specific)
   *   2. group_id    (fallback)
   *   3. routingTag  (least specific)
   */
  async resolveBySharedFs(opts: {
    subjectCustomerId?: string;
    companyId?: string | number;
    groupId?: string | number;
    tags?: string[];
  }): Promise<CustomerConfig | null> {
    const { companyId, groupId, tags } = opts;
    let customer: CustomerDocument | null = null;

    // 0. Try subject-embedded customer ID (highest priority, e.g. "[CUST-42]" in subject)
    if (opts.subjectCustomerId) {
      customer = await this.customerModel.findOne({
        freshserviceCustomerId: opts.subjectCustomerId,
        isActive: true,
      }).lean();
      if (customer) {
        this.logger.log(`🏷️  [SharedFS] Routed via subject CustomerID "${opts.subjectCustomerId}" → "${customer.slug}"`);
      }
    }

    // 1. Try company_id first
    if (companyId != null) {
      customer = await this.customerModel.findOne({
        freshserviceCompanyId: String(companyId),
        isActive: true,
      }).lean();
    }

    // 2. Try group_id
    if (!customer && groupId != null) {
      customer = await this.customerModel.findOne({
        freshserviceGroupId: String(groupId),
        isActive: true,
      }).lean();
    }

    // 3. Try routing tags
    if (!customer && tags && tags.length > 0) {
      customer = await this.customerModel.findOne({
        freshserviceRoutingTag: { $in: tags },
        isActive: true,
      }).lean();
    }

    if (!customer) {
      this.logger.warn(
        `⚠️  [SharedFS] No customer matched. companyId=${companyId} groupId=${groupId} tags=${tags?.join(',')}`,
      );
      return null;
    }

    this.logger.log(`🏷️  [SharedFS] Routed to customer "${customer.slug}" via shared FS dispatcher`);
    return this.buildConfig(customer);
  }

  /**
   * Update cumulative sync stats for a customer.
   */
  async recordSyncResult(slug: string, success: boolean): Promise<void> {
    try {
      await this.customerModel.updateOne(
        { slug },
        {
          $inc: {
            totalSyncs: 1,
            successfulSyncs: success ? 1 : 0,
            failedSyncs: success ? 0 : 1,
          },
          $set: { lastWebhookAt: new Date() },
        },
      );
    } catch (err) {
      this.logger.error(`Failed to update sync stats for ${slug}: ${err?.message}`);
    }
  }
}
