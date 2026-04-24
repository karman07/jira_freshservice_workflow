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

    // ── STEP 1: Extract customer ID from raw body string FIRST ─────────────
    // We grep the raw body directly for the "subject" field and URL-decode it.
    // This works regardless of how Express parsed the body (JSON, form, etc.)
    // and bypasses all rescue/parsing complexity for the routing decision.
    let subjectCustomerId: string | undefined;
    let cleanedSubject = '';

    const rawBodyStr = req.rawBody ?? '';
    // Match "subject":"..." in the raw body (handles JSON with URL-encoded values)
    const rawSubjectMatch = rawBodyStr.match(/"subject"\s*:\s*"([^"]+)"/);
    if (rawSubjectMatch) {
      let subjectVal = rawSubjectMatch[1];
      // URL-decode (handles %20, %5B etc. inside the JSON string value)
      try { subjectVal = decodeURIComponent(subjectVal.replace(/\+/g, ' ')); } catch (_) {}

      this.logger.log(`🔍 [FS-SHARED] Raw subject extracted: "${subjectVal}"`);

      const custMatch = subjectVal.match(/^\[([^\]]+)\]\s*/);
      if (custMatch) {
        subjectCustomerId = custMatch[1];
        cleanedSubject    = subjectVal.replace(/^\[[^\]]+\]\s*/, '').trim();
        this.logger.log(`🏷️  [FS-SHARED] Customer ID from subject: "${subjectCustomerId}" | Cleaned subject: "${cleanedSubject}"`);
      } else {
        cleanedSubject = subjectVal;
      }
    }

    // ── STEP 2: Build a clean payload for downstream processing ────────────
    // Freshservice sends two kinds of "broken" payloads:
    //   ticket_created  → valid JSON with URL-encoded field VALUES
    //   ticket_updated  → INVALID JSON with unquoted values:
    //                     "id": INC-372,  "priority": Low,  "status": Open
    // Strategy (tries in order):
    //   1. JSON.parse(rawBodyStr)        — valid JSON, URL-encoded values
    //   2. JSON.parse(sanitized)         — invalid JSON with unquoted values fixed
    //   3. JSON.parse(decoded)           — rare payload=... wrapped case
    //   4. Regex-extract key fields      — last resort, build minimal payload
    let finalPayload: any = payload; // default: what Express parsed

    if (rawBodyStr) {
      // Try 1: parse raw body as-is (valid JSON with URL-encoded values)
      try {
        const parsed = JSON.parse(rawBodyStr);
        if (parsed?.event_type || parsed?.ticket || parsed?.freshdesk_webhook) {
          finalPayload = parsed;
          this.logger.log('✅ [FS-SHARED] Parsed raw body as JSON directly');
        }
      } catch (_) {
        // Try 2: sanitize unquoted string values then parse
        // Fixes: "priority": Low,  "status": Open,  "id": INC-372,
        try {
          const sanitized = rawBodyStr
            .replace(/:\s*([A-Za-z][A-Za-z0-9_\-]*)\s*([,}\]\r\n])/g, ': "$1"$2')
            .replace(/:\s*([A-Za-z][A-Za-z0-9_\-]*)\s*$/gm, ': "$1"');
          const parsed = JSON.parse(sanitized);
          if (parsed?.event_type || parsed?.ticket || parsed?.freshdesk_webhook) {
            finalPayload = parsed;
            this.logger.log('✅ [FS-SHARED] Parsed sanitized JSON body (unquoted values fixed)');
          }
        } catch (_) {
          // Try 3: payload=... wrapped body
          try {
            let decoded = rawBodyStr;
            if (decoded.startsWith('payload=')) {
              decoded = decodeURIComponent(decoded.slice('payload='.length));
            }
            const parsed = JSON.parse(decoded);
            if (parsed?.event_type || parsed?.ticket || parsed?.freshdesk_webhook) {
              finalPayload = parsed;
              this.logger.log('✅ [FS-SHARED] Parsed payload= wrapped body as JSON');
            }
          } catch (_) {
            // Try 4: regex-extract key fields directly from raw body string
            // This handles completely broken payloads as a last resort
            const evtMatch  = rawBodyStr.match(/"event_type"\s*:\s*"([^"]+)"/);
            const idMatch   = rawBodyStr.match(/"id"\s*:\s*"?([A-Za-z0-9_\-]+)"?/);
            const subjMatch = rawBodyStr.match(/"subject"\s*:\s*"([^"]+)"/);
            const priMatch  = rawBodyStr.match(/"priority"\s*:\s*"?([A-Za-z0-9]+)"?/);
            const stMatch   = rawBodyStr.match(/"status"\s*:\s*"?([A-Za-z0-9]+)"?/);
            const descMatch = rawBodyStr.match(/"description_text"\s*:\s*"([^"]+)"/);
            if (evtMatch || idMatch) {
              finalPayload = {
                event_type: evtMatch?.[1],
                ticket: {
                  id:               idMatch?.[1],
                  subject:          subjMatch?.[1] ?? '',
                  priority:         priMatch?.[1],
                  status:           stMatch?.[1],
                  description_text: descMatch?.[1] ?? '',
                },
              };
              this.logger.log(`✅ [FS-SHARED] Regex-extracted payload fallback: event=${evtMatch?.[1]} id=${idMatch?.[1]}`);
            } else {
              this.logger.debug('ℹ️  [FS-SHARED] All parse attempts failed — using Express payload as last resort');
            }
          }
        }
      }
    }

    // URL-decode the string VALUES inside the already-parsed payload
    // (converts "[dine3d]%20pls%20ignore" → "[dine3d] pls ignore", etc.)
    finalPayload = this.decodePayloadValues(finalPayload);

    // Patch the cleaned subject into the payload so downstream sees the stripped version
    const ticket = finalPayload?.ticket ?? {};
    if (subjectCustomerId) {
      finalPayload = { ...finalPayload, ticket: { ...ticket, subject: cleanedSubject } };
    }
    const patchedTicket = finalPayload?.ticket ?? {};

    const rawTicketId = patchedTicket.id ?? finalPayload?.ticket_id ?? finalPayload?.freshdesk_webhook?.ticket_id ?? 'n/a';
    const companyId   = patchedTicket.company_id ?? finalPayload?.company_id;
    const groupId     = patchedTicket.group_id   ?? finalPayload?.group_id;
    const tags: string[] = patchedTicket.tags    ?? finalPayload?.tags ?? [];

    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [FS-SHARED] Ticket: ${rawTicketId} | Subject: "${cleanedSubject || patchedTicket.subject || '(none)'}"\n` +
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
    this.logger.log(
      `🚀 [FS-SHARED] Forwarding to SyncService → Jira [${customerConfig.jiraProjectKey}] | ` +
      `event="${finalPayload?.event_type}" ticket="${patchedTicket.id ?? rawTicketId}" subject="${cleanedSubject || patchedTicket.subject}"`,
    );

    try {
      const result = await this.syncService.handleFreshserviceEvent(finalPayload, customerConfig);
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

    // Already has a top-level event_type — payload was parsed correctly by Express.
    // Still run through to URL-decode any encoded field values inside.
    if (payload.event_type || payload.freshdesk_webhook) {
      return this.decodePayloadValues(payload);
    }

    try {
      let rawStr = '';

      if (rawBody && rawBody.trim() !== '') {
        rawStr = rawBody.trim();

        // Step 1: URL-decode the raw body (handles form-urlencoded wrapper)
        if (rawStr.includes('%') || rawStr.includes('+')) {
          try { rawStr = decodeURIComponent(rawStr.replace(/\+/g, ' ')); } catch (_) {}
        }

        // Step 2: strip leading "payload=" if Freshservice wrapped it
        if (rawStr.startsWith('payload=')) {
          rawStr = rawStr.replace(/^payload=/, '');
        } else if (rawStr.endsWith('=') && !rawStr.includes(':')) {
          rawStr = rawStr.slice(0, -1);
        }
      } else {
        // Reconstruct raw string from Express's half-parsed object
        const reconstruct = (obj: any): string => {
          let str = '';
          for (const [key, value] of Object.entries(obj)) {
            str += key;
            if (value && typeof value === 'object') str += reconstruct(value);
            else if (typeof value === 'string' && value !== '') str += value;
          }
          return str;
        };
        rawStr = reconstruct(payload).trim();
      }

      this.logger.debug(`🩹 [RESCUE] Reconstructed raw string: ${rawStr}`);

      if (!rawStr.startsWith('{')) return payload;

      // ── STEP A: Try clean JSON.parse FIRST (before any regex mangling) ──────
      // This handles the common case where Freshservice sends a fully valid JSON
      // body but wrapped in URL-encoding at the transport layer. The regexes
      // below corrupt HTML in description_text — avoid them if unnecessary.
      try {
        const cleanParsed = JSON.parse(rawStr);
        if (cleanParsed && (cleanParsed.event_type || cleanParsed.ticket || cleanParsed.freshdesk_webhook)) {
          this.logger.log('🩹 [RESCUE] Clean JSON.parse succeeded — returning decoded payload');
          return this.decodePayloadValues(cleanParsed);
        }
      } catch (_) {
        // Not valid JSON as-is — fall through to regex rescue
      }

      // ── STEP B: Regex rescue for genuinely malformed payloads ────────────────
      let mangled = rawStr;
      mangled = mangled.replace(/:\s*([a-zA-Z][a-zA-Z0-9_\-\s]*?)\s*([,}])/g, ': "$1"$2');
      mangled = mangled.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

      let attempts = 0;
      let finalParsed: any = null;
      let currentStr = mangled;
      while (attempts < 5) {
        try { finalParsed = JSON.parse(currentStr); break; }
        catch (_) { currentStr += '}'; attempts++; }
      }

      if (finalParsed) {
        this.logger.log('🩹 [RESCUE] Regex-rescued and parsed broken JSON payload');
        return this.decodePayloadValues(finalParsed);
      }

      return payload;
    } catch (_) {
      return payload;
    }
  }

  /**
   * Recursively URL-decode all string values inside a parsed payload object.
   * Freshservice sometimes sends JSON with URL-encoded field values
   * (e.g. subject: "[dine3d]%20final%20test%20ticket").
   */
  private decodePayloadValues(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.decodePayloadValues(v));
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        try { result[key] = decodeURIComponent(value.replace(/\+/g, ' ')); }
        catch (_) { result[key] = value; }
      } else if (value && typeof value === 'object') {
        result[key] = this.decodePayloadValues(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
