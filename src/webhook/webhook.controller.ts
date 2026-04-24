import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Param,
  Query,
  Get,
  Res,
} from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { CustomerConfigService } from '../admin/customer-config.service';
import { FsPairSyncService } from '../freshservice/fs-pair-sync.service';
import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

/**
 * WebhookController
 * ─────────────────
 * Receives raw webhook payloads from both Jira and Freshservice.
 *
 * ALL routes are now per-customer (tenant-scoped) via :customerSlug:
 *
 *   POST /api/webhook/jira/:customerSlug           ← Jira → per-customer
 *   POST /api/webhook/freshservice/:customerSlug   ← Freshservice → per-customer
 *
 * Legacy single-project routes (backward compat):
 *   POST /api/webhook/jira           ← uses JIRA_PROJECT_KEY from .env
 *   POST /api/webhook/freshservice   ← uses env credentials
 *
 * Always returns HTTP 200 so neither platform retries on transient errors.
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly customerConfigService: CustomerConfigService,
    private readonly fsPairSyncService: FsPairSyncService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/jira/:customerSlug
  // ─────────────────────────────────────────────────────────────
  @Post('jira/:customerSlug')
  @HttpCode(HttpStatus.OK)
  async handleJiraWebhookForCustomer(
    @Param('customerSlug') customerSlug: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    const webhookEvent: string =
      payload?.webhookEvent ?? payload?.issue_event_type_name ?? 'unknown';

    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [JIRA][${customerSlug}] Event: "${webhookEvent}"\n` +
      `   Issue: ${payload?.issue?.key ?? 'n/a'} — ${payload?.issue?.fields?.summary ?? ''}\n` +
      `${'═'.repeat(60)}`,
    );

    if (!payload || !payload.issue) {
      this.logger.warn(`⚠️  [JIRA][${customerSlug}] Empty or malformed payload — ignoring`);
      return { received: true, status: 'ignored', reason: 'malformed payload' };
    }

    try {
      const customerConfig = await this.customerConfigService.resolveBySlug(customerSlug);
      const result = await this.syncService.handleJiraEvent(webhookEvent, payload, customerConfig);
      await this.customerConfigService.recordSyncResult(customerSlug, result.status === 'success');
      this.logger.log(`📤 [JIRA][${customerSlug}] Done — ${result.status} | ${result.message}`);
      return { received: true, customer: customerSlug, ...result };
    } catch (err) {
      this.logger.error(`❌ [JIRA][${customerSlug}] Error: ${err?.message}`);
      await this.customerConfigService.recordSyncResult(customerSlug, false).catch(() => {});
      return { received: true, customer: customerSlug, status: 'error', error: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/freshservice/:customerSlug
  // ─────────────────────────────────────────────────────────────
  @Post('freshservice/:customerSlug')
  @HttpCode(HttpStatus.OK)
  async handleFreshserviceWebhookForCustomer(
    @Param('customerSlug') customerSlug: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request & { rawBody?: string },
  ) {
    this.logger.debug(`\n--- INCOMING RAW PAYLOAD [${customerSlug}] ---\n${req.rawBody}\n---`);

    if (!payload || Object.keys(payload).length === 0) {
      this.logger.warn(`⚠️  [FS][${customerSlug}] Empty payload — ignoring`);
      return { received: true, status: 'ignored', reason: 'empty payload' };
    }

    if (typeof payload === 'object') {
      payload = this.rescueMalformedPayload(payload, req.rawBody);
    }

    const rawType     = payload?.event_type ?? '(no event_type)';
    const rawTicketId = payload?.ticket_id ?? payload?.ticket?.id ?? payload?.freshdesk_webhook?.ticket_id ?? 'n/a';
    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [FS][${customerSlug}] Raw event: "${rawType}" | Ticket: ${rawTicketId}\n` +
      `${'═'.repeat(60)}`,
    );

    try {
      const customerConfig = await this.customerConfigService.resolveBySlug(customerSlug);
      const result = await this.syncService.handleFreshserviceEvent(payload, customerConfig);
      await this.customerConfigService.recordSyncResult(customerSlug, result.status === 'success');
      this.logger.log(`📤 [FS][${customerSlug}] Done — ${result.status} | ${result.message}`);
      return { received: true, customer: customerSlug, ...result };
    } catch (err) {
      this.logger.error(`❌ [FS][${customerSlug}] Error: ${err?.message}`);
      await this.customerConfigService.recordSyncResult(customerSlug, false).catch(() => {});
      return { received: true, customer: customerSlug, status: 'error', error: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/freshservice-shared
  //
  // Shared Freshservice Dispatcher — ONE webhook URL for all customers.
  // Freshservice fires this single endpoint; the server resolves WHICH
  // customer owns this ticket via:
  //   1. ticket.company_id  → Customer.freshserviceCompanyId
  //   2. ticket.group_id    → Customer.freshserviceGroupId
  //   3. ticket.tags[]      → Customer.freshserviceRoutingTag
  //
  // Race-around isolation: only the matched customer's Jira/FS is notified.
  // All other customers are completely unaware of the ticket.
  // ─────────────────────────────────────────────────────────────
  @Post('freshservice-shared')
  @HttpCode(HttpStatus.OK)
  async handleSharedFreshserviceWebhook(
    @Body() payload: any,
    @Req() req: Request & { rawBody?: string },
  ) {
    this.logger.debug(`\n--- SHARED FS DISPATCHER RAW ---\n${req.rawBody}\n---`);

    if (!payload || Object.keys(payload).length === 0) {
      this.logger.warn('⚠️  [FS-SHARED] Empty payload — ignoring');
      return { received: true, status: 'ignored', reason: 'empty payload' };
    }

    if (typeof payload === 'object') {
      payload = this.rescueMalformedPayload(payload, req.rawBody);
    }

    // Extract routing identifiers from the ticket
    const ticket = payload?.ticket ?? {};
    const rawSubject: string = ticket.subject ?? ticket.name ?? payload?.subject ?? '';
    const companyId  = ticket.company_id  ?? payload?.company_id;
    const groupId    = ticket.group_id    ?? payload?.group_id;
    const tags: string[] = ticket.tags    ?? payload?.tags ?? [];
    const rawTicketId = ticket.id ?? payload?.ticket_id ?? 'n/a';

    // ── Subject-based Customer ID extraction ───────────────────
    // Pattern: "[CUST-42] Ticket subject" or "[dine3d] Ticket subject"
    const subjectCustMatch = rawSubject.match(/^\[([^\]]+)\]\s*/);
    const subjectCustomerId = subjectCustMatch ? subjectCustMatch[1] : undefined;
    const cleanedSubject = subjectCustomerId
      ? rawSubject.replace(/^\[[^\]]+\]\s*/, '').trim()
      : rawSubject;

    // Mutate payload to use the cleaned subject for downstream processing
    if (subjectCustomerId && cleanedSubject && ticket.subject) {
      payload = {
        ...payload,
        ticket: { ...ticket, subject: cleanedSubject },
      };
    }

    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [FS-SHARED] Ticket: ${rawTicketId} | Subject: "${rawSubject}"\n` +
      `   SubjectCustId: ${subjectCustomerId ?? 'none'} | CompanyId: ${companyId ?? 'none'} | GroupId: ${groupId ?? 'none'} | Tags: [${tags.join(', ')}]\n` +
      `${'═'.repeat(60)}`,
    );

    // Resolve which customer owns this ticket
    const customerConfig = await this.customerConfigService.resolveBySharedFs({
      subjectCustomerId,
      companyId,
      groupId,
      tags,
    });

    if (!customerConfig) {
      this.logger.warn(
        `⚠️  [FS-SHARED] No customer matched for ticket #${rawTicketId}. ` +
        `subjectCustId=${subjectCustomerId} companyId=${companyId} groupId=${groupId} tags=[${tags.join(',')}]. ` +
        `Ticket silently dropped — other customers unaffected.`,
      );
      return {
        received: true,
        status: 'skipped',
        reason: `No customer matched — tried subjectCustId=${subjectCustomerId} companyId=${companyId} groupId=${groupId} tags=[${tags.join(',')}]`,
      };
    }

    this.logger.log(
      `🎯 [FS-SHARED] Ticket #${rawTicketId} → Customer "${customerConfig.slug}" (isolated routing)`,
    );

    try {
      const result = await this.syncService.handleFreshserviceEvent(payload, customerConfig);
      await this.customerConfigService.recordSyncResult(customerConfig.slug, result.status === 'success');
      this.logger.log(`📤 [FS-SHARED][${customerConfig.slug}] Done — ${result.status} | ${result.message}`);
      return { received: true, customer: customerConfig.slug, routedVia: { subjectCustomerId, companyId, groupId, tags }, cleanedSubject, ...result };
    } catch (err) {
      this.logger.error(`❌ [FS-SHARED][${customerConfig.slug}] Error: ${err?.message}`);
      await this.customerConfigService.recordSyncResult(customerConfig.slug, false).catch(() => {});
      return { received: true, customer: customerConfig.slug, status: 'error', error: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/freshservice-pair/:customerSlug
  //
  // Called by the Freshservice Automation Rule on EACH instance.
  // Use the ?origin= query param to identify the calling instance:
  //   ?origin=instanceA  ← default, Instance A is calling
  //   ?origin=instanceB  ← Instance B is calling
  //
  // This single endpoint handles both directions so you only need
  // one webhook URL base per customer.
  // ─────────────────────────────────────────────────────────────
  @Post('freshservice-pair/:customerSlug')
  @HttpCode(HttpStatus.OK)
  async handleFsPairWebhook(
    @Param('customerSlug') customerSlug: string,
    @Query('origin') origin: string,
    @Body() payload: any,
    @Req() req: Request & { rawBody?: string },
  ) {
    this.logger.debug(`\n--- FS-PAIR RAW [${customerSlug}][${origin ?? 'instanceA'}] ---\n${req.rawBody}\n---`);

    if (!payload || Object.keys(payload).length === 0) {
      this.logger.warn(`⚠️  [FS-PAIR][${customerSlug}] Empty payload — ignoring`);
      return { received: true, status: 'ignored', reason: 'empty payload' };
    }

    if (typeof payload === 'object') {
      payload = this.rescueMalformedPayload(payload, req.rawBody);
    }

    const normalizedOrigin: 'instanceA' | 'instanceB' =
      origin === 'instanceB' ? 'instanceB' : 'instanceA';

    const rawTicketId =
      payload?.ticket_id ?? payload?.ticket?.id ?? payload?.freshdesk_webhook?.ticket_id ?? 'n/a';

    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [FS-PAIR][${customerSlug}][${normalizedOrigin}] Ticket: ${rawTicketId}\n` +
      `${'═'.repeat(60)}`,
    );

    try {
      const customerConfig = await this.customerConfigService.resolveBySlug(customerSlug);
      const result = await this.fsPairSyncService.handleFsPairEvent(
        payload,
        normalizedOrigin,
        customerConfig,
      );
      await this.customerConfigService.recordSyncResult(customerSlug, result.status === 'success');
      this.logger.log(`📤 [FS-PAIR][${customerSlug}] Done — ${result.status} | ${result.message}`);
      return { received: true, customer: customerSlug, origin: normalizedOrigin, ...result };
    } catch (err) {
      this.logger.error(`❌ [FS-PAIR][${customerSlug}] Error: ${err?.message}`);
      await this.customerConfigService.recordSyncResult(customerSlug, false).catch(() => {});
      return { received: true, customer: customerSlug, status: 'error', error: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Legacy routes (single-project, uses .env credentials)
  // ─────────────────────────────────────────────────────────────

  @Post('jira')
  @HttpCode(HttpStatus.OK)
  async handleJiraWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    const webhookEvent: string =
      payload?.webhookEvent ?? payload?.issue_event_type_name ?? 'unknown';

    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [JIRA][legacy] Event: "${webhookEvent}"\n` +
      `   Issue: ${payload?.issue?.key ?? 'n/a'} — ${payload?.issue?.fields?.summary ?? ''}\n` +
      `${'═'.repeat(60)}`,
    );

    if (!payload || !payload.issue) {
      this.logger.warn('⚠️  [JIRA][legacy] Empty or malformed payload — ignoring');
      return { received: true, status: 'ignored', reason: 'malformed payload' };
    }

    try {
      // Build config from environment (legacy mode)
      const legacyConfig = this.getLegacyConfig();
      const result = await this.syncService.handleJiraEvent(webhookEvent, payload, legacyConfig);
      return { received: true, ...result };
    } catch (err) {
      this.logger.error(`❌ [JIRA][legacy] Sync error: ${err?.message}`);
      return { received: true, status: 'error', error: err?.message };
    }
  }

  @Post('freshservice')
  @HttpCode(HttpStatus.OK)
  async handleFreshserviceWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request & { rawBody?: string },
  ) {
    this.logger.debug(`\n--- INCOMING RAW PAYLOAD [legacy] ---\n${req.rawBody}\n---`);

    if (!payload || Object.keys(payload).length === 0) {
      this.logger.warn('⚠️  [FS][legacy] Empty payload — ignoring');
      return { received: true, status: 'ignored', reason: 'empty payload' };
    }

    if (typeof payload === 'object') {
      payload = this.rescueMalformedPayload(payload, req.rawBody);
    }

    try {
      const legacyConfig = this.getLegacyConfig();
      const result = await this.syncService.handleFreshserviceEvent(payload, legacyConfig);
      return { received: true, ...result };
    } catch (err) {
      this.logger.error(`❌ [FS][legacy] Unhandled error: ${err?.message}`);
      return { received: true, status: 'error', error: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * getLegacyConfig()
   * Builds a CustomerConfig from the global .env variables for backward compat.
   * This is used when clients call the non-scoped webhook endpoints.
   */
  private getLegacyConfig(): import('../admin/customer-config.service').CustomerConfig {
    return {
      customerId: 'legacy',
      slug: 'legacy',
      name: 'Legacy (env-based)',
      jiraBaseUrl:     process.env.JIRA_BASE_URL ?? '',
      jiraEmail:       process.env.JIRA_EMAIL ?? '',
      jiraApiToken:    process.env.JIRA_API_TOKEN ?? '',
      jiraProjectKey:  process.env.JIRA_PROJECT_KEY ?? 'SCRUM',
      freshserviceBaseUrl: process.env.FRESHSERVICE_BASE_URL ?? '',
      freshserviceApiKey:  process.env.FRESHSERVICE_API_KEY ?? '',
      fsCustomStatusAwaiting: process.env.FS_CUSTOM_STATUS_AWAITING ?? '',
      fallbackEmail: process.env.FALLBACK_EMAIL ?? '',
      // FS pairing — disabled for legacy mode
      fsPairEnabled: false,
      fs2BaseUrl:    process.env.FS2_BASE_URL ?? '',
      fs2ApiKey:     process.env.FS2_API_KEY ?? '',
      fs2FallbackEmail: process.env.FS2_FALLBACK_EMAIL ?? process.env.FALLBACK_EMAIL ?? '',
    };
  }

  /**
   * rescueMalformedPayload()
   * Deeply aggressive rescue logic for Freshservice "Fake JSON" payloads.
   */
  private rescueMalformedPayload(payload: any, rawBody?: string): any {
    if (!payload || typeof payload !== 'object') return payload;

    if (payload.event_type || payload.freshdesk_webhook) return payload;

    try {
      let rawStr = '';

      if (rawBody && rawBody.trim() !== '') {
        rawStr = rawBody.trim();
        if (rawStr.includes('%') || rawStr.includes('+')) {
          try {
            rawStr = decodeURIComponent(rawStr.replace(/\+/g, ' '));
          } catch (e) {
            // ignore decode error
          }
        }
        if (rawStr.startsWith('payload=')) {
          rawStr = rawStr.replace(/^payload=/, '');
        } else if (rawStr.endsWith('=')) {
          rawStr = rawStr.slice(0, -1);
        }
      } else {
        const reconstruct = (obj: any): string => {
          let str = '';
          const entries = Object.entries(obj);
          for (const [key, value] of entries) {
            str += key;
            if (value && typeof value === 'object') {
              str += reconstruct(value);
            } else if (typeof value === 'string' && value !== '') {
              str += value;
            }
          }
          return str;
        };
        rawStr = reconstruct(payload).trim();
      }

      this.logger.debug(`🩹 [RESCUE] Reconstructed raw string: ${rawStr}`);

      if (!rawStr.startsWith('{')) return payload;

      rawStr = rawStr.replace(/:\s*([a-zA-Z][a-zA-Z0-9_\-\s]*?)\s*([,}])/g, ': "$1"$2');
      rawStr = rawStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

      let attempts = 0;
      let finalParsed = null;
      let currentStr = rawStr;

      while (attempts < 5) {
        try {
          finalParsed = JSON.parse(currentStr);
          break;
        } catch (e) {
          currentStr += '}';
          attempts++;
        }
      }

      if (finalParsed) {
        this.logger.log('🩹 [RESCUE] Successfully reassembled and parsed broken JSON payload');
        return finalParsed;
      }

      return payload;

    } catch (err) {
      return payload;
    }
  }
}
