import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { Request } from 'express';
/**
 * WebhookController
 * ─────────────────
 * Receives raw webhook payloads from both Jira and Freshservice.
 * Validates basic shape, extracts event type, then delegates to SyncService.
 *
 * Routes:
 *   POST /api/webhook/jira           ← Jira automation webhook
 *   POST /api/webhook/freshservice   ← Freshservice automation webhook
 *
 * Always returns HTTP 200 to the caller (even on sync errors)
 * so neither platform keeps retrying infinitely.
 *
 * Event types handled:
 *
 *  FROM JIRA:
 *   jira:issue_created    → Create Freshservice ticket
 *   jira:issue_updated    → Update FS ticket (status, priority, summary, description)
 *   comment_created       → Add note to FS ticket
 *   comment_updated       → Update note in FS ticket
 *   jira:attachment_created → Add attachment reference note in FS
 *
 *  FROM FRESHSERVICE (via Automation Rule → Webhook):
 *   ticket_created        → Create Jira issue
 *   ticket_updated        → Update Jira issue (priority, status, summary)
 *   note_created          → Add comment in Jira
 *   reply_created         → Add comment in Jira
 *   attachment_added      → Add attachment reference comment in Jira
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly syncService: SyncService) {}

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/jira
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
      `📥 [JIRA → WEBHOOK] Event: "${webhookEvent}"\n` +
      `   Issue: ${payload?.issue?.key ?? 'n/a'} — ${payload?.issue?.fields?.summary ?? ''}\n` +
      `   Priority: ${payload?.issue?.fields?.priority?.name ?? 'n/a'}\n` +
      `   Status:   ${payload?.issue?.fields?.status?.name ?? 'n/a'}\n` +
      `${'═'.repeat(60)}`,
    );

    if (!payload || !payload.issue) {
      this.logger.warn('⚠️  [JIRA WEBHOOK] Empty or malformed payload — ignoring');
      return { received: true, status: 'ignored', reason: 'malformed payload' };
    }

    let result = { status: 'skipped', message: 'No handler matched' };

    try {
      result = await this.syncService.handleJiraEvent(webhookEvent, payload);
    } catch (err) {
      this.logger.error(
        `❌ [JIRA WEBHOOK] Sync error for "${webhookEvent}": ${err?.message}`,
      );
      // Return 200 so Jira does not retry
      return { received: true, status: 'error', error: err?.message };
    }

    this.logger.log(
      `📤 [JIRA WEBHOOK] Done — Status: "${result.status}" | ${result.message}`,
    );

    return { received: true, ...result };
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/webhook/freshservice
  // ─────────────────────────────────────────────────────────────
  //
  //  This controller is intentionally THIN.
  //  All event classification is done inside FreshserviceClassifierService.
  //  Controller responsibilities:
  //    1. Validate payload is not empty
  //    2. Log the raw incoming event for observability
  //    3. Delegate to syncService.handleFreshserviceEvent()
  //    4. Always return HTTP 200 (prevents FS retrying on transient errors)
  // ─────────────────────────────────────────────────────────────
  @Post('freshservice')
  @HttpCode(HttpStatus.OK)
  async handleFreshserviceWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Req() req: Request & { rawBody?: string },
  ) {
    this.logger.debug(`\n--- INCOMING RAW PAYLOAD DUMP ---\nRAW BODY OVER WIRE: ${req.rawBody}\n---------------------------------`);

    if (!payload || Object.keys(payload).length === 0) {
      this.logger.warn('⚠️  [FS WEBHOOK] Empty payload — ignoring');
      return { received: true, status: 'ignored', reason: 'empty payload' };
    }

    if (typeof payload === 'object') {
      payload = this.rescueMalformedPayload(payload, req.rawBody);
    }

    // Lightweight pre-logging so we can trace in server logs before classifier runs
    const rawType     = payload?.event_type ?? '(no event_type)';
    const rawTicketId = payload?.ticket_id ?? payload?.ticket?.id ?? payload?.freshdesk_webhook?.ticket_id ?? 'n/a';
    this.logger.log(
      `\n${'═'.repeat(60)}\n` +
      `📥 [FS WEBHOOK] Raw event: "${rawType}" | Ticket: ${rawTicketId}\n` +
      `${'═'.repeat(60)}`,
    );

    let result: { status: string; message: string } = {
      status: 'skipped',
      message: 'No handler matched',
    };

    try {
      // Single call — classifier + routing happens inside SyncService
      result = await this.syncService.handleFreshserviceEvent(payload);
    } catch (err) {
      this.logger.error(
        `❌ [FS WEBHOOK] Unhandled error for event "${rawType}": ${err?.message}`,
      );
      // Return 200 so Freshservice does not retry — error is already logged/audited
      return { received: true, status: 'error', error: err?.message };
    }

    this.logger.log(
      `📤 [FS WEBHOOK] Done — Status: "${result.status}" | ${result.message}`,
    );

    return { received: true, ...result };
  }

  /**
   * rescueMalformedPayload()
   * ────────────────────────
   * Deeply aggressive rescue logic for Freshservice "Fake JSON" payloads.
   * Handles:
   *  1. JSON fragmented across object keys (body-parser splitting on '=' or '&')
   *  2. Unquoted identifiers (e.g. "id": INC-321 which should be "INC-321")
   *  3. Recursive reconstruction of broken form-data objects
   */
  private rescueMalformedPayload(payload: any, rawBody?: string): any {
    if (!payload || typeof payload !== 'object') return payload;
    
    // If it's already a valid FS event with event_type, don't mess with it
    if (payload.event_type || payload.freshdesk_webhook) return payload;

    try {
      let rawStr = '';

      if (rawBody && rawBody.trim() !== '') {
        // Prefer the actual wire bytes if we captured them in main.ts
        rawStr = rawBody.trim();
        // Since urlencoded format replaces spaces with + and encodes symbols, try decoding
        if (rawStr.includes('%') || rawStr.includes('+')) {
          try {
            rawStr = decodeURIComponent(rawStr.replace(/\+/g, ' '));
          } catch (e) {
            // ignore decode error
          }
        }
        // If the payload was sent as `payload={...}` or just `{...}=`
        if (rawStr.startsWith('payload=')) {
          rawStr = rawStr.replace(/^payload=/, '');
        } else if (rawStr.endsWith('=')) {
          rawStr = rawStr.slice(0, -1);
        }
      } else {
        // Fallback: Reconstruct raw string from the fragmented object
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

      // 2. Fix common "Invalid JSON" errors from FS unquoted placeholders
      // Example: "id": INC-321,           -> "id": "INC-321",
      // Example: "priority": Medium,      -> "priority": "Medium",
      // Example: "status": Open           -> "status": "Open"
      rawStr = rawStr.replace(/:\s*([a-zA-Z][a-zA-Z0-9_\-\s]*?)\s*([,}])/g, ': "$1"$2');
      
      // Fix unquoted keys in common nested patterns
      rawStr = rawStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

      // 3. Bruteforce closing if it's truncated
      // (Freshservice automation sometimes cuts off the end if there's an unescaped char)
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
