import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument } from '../database/schemas/admin.schema';
import { Customer, CustomerDocument } from '../database/schemas/customer.schema';
import { SyncLog, SyncLogDocument } from '../database/schemas/sync-log.schema';
import { FsPairMapping, FsPairMappingDocument } from '../database/schemas/fs-pair-mapping.schema';
import { LoginDto, CreateCustomerDto, UpdateCustomerDto } from './admin.dto';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(SyncLog.name) private readonly syncLogModel: Model<SyncLogDocument>,
    @InjectModel(FsPairMapping.name) private readonly fsPairModel: Model<FsPairMappingDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Seed the default admin account on startup if none exists.
   * Credentials: admin@intell.io / admin123 (change via env ADMIN_EMAIL / ADMIN_PASSWORD)
   */
  async onModuleInit() {
    const count = await this.adminModel.countDocuments();
    if (count === 0) {
      const email = this.configService.get<string>('ADMIN_EMAIL') ?? 'admin@intell.io';
      const password = this.configService.get<string>('ADMIN_PASSWORD') ?? 'admin123';
      const passwordHash = await bcrypt.hash(password, 12);
      await this.adminModel.create({ email, passwordHash, role: 'admin' });
      this.logger.log(`🔐 [Admin] Default admin seeded: ${email}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ token: string; email: string }> {
    const admin = await this.adminModel.findOne({ email: dto.email });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: admin._id.toString(),
      email: admin.email,
      role: admin.role,
    });

    this.logger.log(`🔑 [Admin] Login: ${admin.email}`);
    return { token, email: admin.email };
  }

  // ─────────────────────────────────────────────────────────────
  // Customer CRUD
  // ─────────────────────────────────────────────────────────────

  async createCustomer(dto: CreateCustomerDto, baseUrl: string): Promise<CustomerDocument> {
    const existing = await this.customerModel.findOne({ slug: dto.slug });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already in use`);

    // Build webhook URLs
    const webhookJiraUrl = `${baseUrl}/api/webhook/jira/${dto.slug}`;
    const webhookFreshserviceUrl = `${baseUrl}/api/webhook/freshservice/${dto.slug}`;
    const webhookFsPairUrl = `${baseUrl}/api/webhook/freshservice-pair/${dto.slug}`;

    const customer = await this.customerModel.create({
      ...dto,
      webhookJiraUrl,
      webhookFreshserviceUrl,
      webhookFsPairUrl,
    });

    this.logger.log(`✅ [Admin] Customer created: "${dto.name}" (slug: ${dto.slug})`);
    return customer;
  }

  async listCustomers(): Promise<CustomerDocument[]> {
    return this.customerModel.find().sort({ createdAt: -1 }).lean();
  }

  async getCustomer(slug: string): Promise<CustomerDocument> {
    const c = await this.customerModel.findOne({ slug }).lean();
    if (!c) throw new NotFoundException(`Customer "${slug}" not found`);
    return c;
  }

  async getCustomerById(id: string): Promise<CustomerDocument> {
    const c = await this.customerModel.findById(id).lean();
    if (!c) throw new NotFoundException(`Customer "${id}" not found`);
    return c;
  }

  async updateCustomer(slug: string, dto: UpdateCustomerDto): Promise<CustomerDocument> {
    // Split the DTO into fields to $set (non-empty) and fields to $unset (empty strings).
    // Sparse-unique fields (e.g. freshserviceCustomerId) must be REMOVED from the document
    // when cleared; setting them to "" would cause a duplicate key error across customers.
    const setPayload: Record<string, any> = {};
    const unsetPayload: Record<string, 1> = {};

    for (const [key, value] of Object.entries(dto)) {
      if (value === '' || value === null || value === undefined) {
        unsetPayload[key] = 1;
      } else {
        setPayload[key] = value;
      }
    }

    const updateOp: Record<string, any> = {};
    if (Object.keys(setPayload).length > 0)   updateOp['$set']   = setPayload;
    if (Object.keys(unsetPayload).length > 0) updateOp['$unset'] = unsetPayload;

    if (Object.keys(updateOp).length === 0) {
      // Nothing to update — just return the existing document
      const existing = await this.customerModel.findOne({ slug }).lean();
      if (!existing) throw new NotFoundException(`Customer "${slug}" not found`);
      return existing;
    }

    const c = await this.customerModel.findOneAndUpdate({ slug }, updateOp, { new: true }).lean();
    if (!c) throw new NotFoundException(`Customer "${slug}" not found`);
    this.logger.log(`🔄 [Admin] Customer updated: "${slug}" (set=${JSON.stringify(Object.keys(setPayload))} unset=${JSON.stringify(Object.keys(unsetPayload))})`);
    return c;
  }

  async deleteCustomer(slug: string): Promise<{ deleted: boolean }> {
    const result = await this.customerModel.deleteOne({ slug });
    if (result.deletedCount === 0) throw new NotFoundException(`Customer "${slug}" not found`);
    this.logger.log(`🗑️  [Admin] Customer deleted: "${slug}"`);
    return { deleted: true };
  }

  async toggleCustomer(slug: string): Promise<CustomerDocument> {
    const customer = await this.customerModel.findOne({ slug });
    if (!customer) throw new NotFoundException(`Customer "${slug}" not found`);
    customer.isActive = !customer.isActive;
    await customer.save();
    return customer;
  }

  // ─────────────────────────────────────────────────────────────
  // Analytics
  // ─────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [totalCustomers, activeCustomers, totalSyncs, recentLogs] = await Promise.all([
      this.customerModel.countDocuments(),
      this.customerModel.countDocuments({ isActive: true }),
      this.syncLogModel.countDocuments(),
      this.syncLogModel.find().sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    // Aggregate success/fail counts
    const [successCount, failedCount, skippedCount] = await Promise.all([
      this.syncLogModel.countDocuments({ status: 'success' }),
      this.syncLogModel.countDocuments({ status: 'failed' }),
      this.syncLogModel.countDocuments({ status: 'skipped' }),
    ]);

    // Per-event-type breakdown
    const eventBreakdown = await this.syncLogModel.aggregate([
      { $group: { _id: '$eventType', count: { $sum: 1 }, successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]);

    // Per-customer breakdown
    const customerBreakdown = await this.syncLogModel.aggregate([
      { $match: { customerId: { $ne: null } } },
      { $group: { _id: '$customerId', total: { $sum: 1 }, successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
      { $sort: { total: -1 } },
    ]);

    // Last 7 days daily activity
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dailyActivity = await this.syncLogModel.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    return {
      overview: {
        totalCustomers,
        activeCustomers,
        totalSyncs,
        successCount,
        failedCount,
        skippedCount,
        successRate: totalSyncs > 0 ? Math.round((successCount / totalSyncs) * 100) : 0,
      },
      eventBreakdown,
      customerBreakdown,
      dailyActivity,
      recentLogs,
    };
  }

  async getCustomerAnalytics(slug: string) {
    const customer = await this.customerModel.findOne({ slug });
    if (!customer) throw new NotFoundException(`Customer "${slug}" not found`);

    const customerId = customer._id.toString();

    const [total, successes, failures, skipped, recentLogs] = await Promise.all([
      this.syncLogModel.countDocuments({ customerId }),
      this.syncLogModel.countDocuments({ customerId, status: 'success' }),
      this.syncLogModel.countDocuments({ customerId, status: 'failed' }),
      this.syncLogModel.countDocuments({ customerId, status: 'skipped' }),
      this.syncLogModel.find({ customerId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const eventBreakdown = await this.syncLogModel.aggregate([
      { $match: { customerId } },
      { $group: { _id: '$eventType', count: { $sum: 1 }, successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dailyActivity = await this.syncLogModel.aggregate([
      { $match: { customerId, createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
        successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    return {
      customer,
      stats: { total, successes, failures, skipped, successRate: total > 0 ? Math.round((successes / total) * 100) : 0 },
      eventBreakdown,
      dailyActivity,
      recentLogs,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // FS Pair Stats
  // ─────────────────────────────────────────────────────────────

  async getFsPairStats(slug: string) {
    const customer = await this.customerModel.findOne({ slug });
    if (!customer) throw new NotFoundException(`Customer "${slug}" not found`);

    const customerId = customer._id.toString();
    const total = await this.fsPairModel.countDocuments({ customerId });
    const recent = await this.fsPairModel
      .find({ customerId })
      .sort({ lastSyncedAt: -1 })
      .limit(10)
      .lean();

    return { total, recent };
  }
}
