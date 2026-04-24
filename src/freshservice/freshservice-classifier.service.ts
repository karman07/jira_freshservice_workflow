import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union — each variant carries exactly the data its handler needs
// ─────────────────────────────────────────────────────────────────────────────
export type FsClassified =
  | {
      type: 'create';
      ticketId: number;
      subject: string;
      description: string;
      fsPriority: number;
      fsStatus: number;
    }
  | {
      type: 'update';
      ticketId: number;
      subject?: string;
      fsPriority?: number;
      fsStatus?: number;
      hasChanges: boolean;
    }
  | {
      type: 'note';
      ticketId: number;
      body: string;
      agentName: string;
      hash: string;        // SHA-256 of body — used for deduplication
    }
  | {
      type: 'attachment';
      ticketId: number;
      attachments: Array<{ name: string; attachment_url: string }>;
    }
  | {
      type: 'unknown';
      reason: string;
    };

/**
 * FreshserviceClassifierService
 * ──────────────────────────────
 * Translates raw Freshservice webhook payloads into typed, normalized events.
 *
 * Freshservice only fires 3 webhooks:
 *   1. ticket_created
 *   2. ticket_updated  ← may carry latest_note → treated as NOTE event
 *   3. attachment_added
 *
 * This service handles all the messy payload shape variations so that
 * SyncService can just switch on `classified.type` and get clean data.
 */
@Injectable()
export class FreshserviceClassifierService {
  private readonly logger = new Logger(FreshserviceClassifierService.name);

  classify(rawPayload: any): FsClassified {
    // ── Normalize payload shape ───────────────────────────────────
    // FS sends different shapes depending on automation rule config:
    //   Shape A: { event_type, ticket: { id, subject, status, priority, latest_note, ... } }
    //   Shape B: { freshdesk_webhook: { ticket_id, ticket_subject, ticket_status, ... } }
    const fw = rawPayload?.freshdesk_webhook;
    const ticket = fw ? null : (rawPayload?.ticket ?? rawPayload);

    const eventType: string =
      rawPayload?.event_type ??
      (fw ? 'ticket_updated' : 'unknown');

    // ── Normalize ticket ID ───────────────────────────────────────
    // Freshservice may send the ticket_id as:
    //   - A number : 99001
    //   - A numeric string: "99001"
    //   - A display ID string: "INC-297" (Number() returns NaN for this)
    // We prefer ticket.id (always numeric) and fall back to extracting
    // the trailing number from display strings like "INC-297" → 297.
    const rawId =
      ticket?.id ??
      rawPayload?.ticket_id ??
      fw?.ticket_id ??
      rawPayload?.id;

    const ticketId = this.parseTicketId(rawId);

    this.logger.log(
      `🔍 [CLASSIFIER] event_type="${eventType}" rawId="${rawId}" ticketId=${ticketId}`,
    );

    if (!ticketId || isNaN(ticketId)) {
      return { type: 'unknown', reason: `Missing or invalid ticket_id (received: "${rawId}")` };
    }

    // ── 1. ticket_created ─────────────────────────────────────────
    if (eventType === 'ticket_created') {
      const subject =
        ticket?.subject ?? 
        ticket?.ticket_subject ?? 
        fw?.ticket_subject ?? 
        rawPayload?.subject ??
        'No Subject';

      // Strip HTML tags — description_text comes as HTML from Freshservice
      const rawDescription =
        ticket?.description_text ??
        ticket?.description ??
        fw?.ticket_description ??
        rawPayload?.description ??
        '';
      const description = this.stripHtml(rawDescription) || 'No description.';

      const priorityRaw = ticket?.priority ?? fw?.ticket_priority ?? rawPayload?.priority ?? 2;
      let fsPriority = Number(priorityRaw);
      if (isNaN(fsPriority) && typeof priorityRaw === 'string') {
        const pMap: any = { low: 1, medium: 2, high: 3, urgent: 4 };
        fsPriority = pMap[priorityRaw.toLowerCase().trim()] ?? 2;
      }
      if (isNaN(fsPriority)) fsPriority = 2;

      const statusRaw = ticket?.status ?? fw?.ticket_status ?? rawPayload?.status ?? 2;
      let fsStatus = Number(statusRaw);
      if (isNaN(fsStatus) && typeof statusRaw === 'string') {
        const sMap: any = { open: 2, pending: 3, resolved: 4, closed: 5 };
        fsStatus = sMap[statusRaw.toLowerCase().trim()] ?? 2;
      }
      if (isNaN(fsStatus)) fsStatus = 2;

      this.logger.log(
        `🎫 [CLASSIFIER] ticket_created → CREATE event | subject="${subject}" priority=${fsPriority} status=${fsStatus} ticketId=${ticketId}`,
      );

      return { type: 'create', ticketId, subject, description, fsPriority, fsStatus };
    }

    // ── 2. ticket_updated ─────────────────────────────────────────
    if (eventType === 'ticket_updated') {
      // Regular field update
      const subject = ticket?.subject ?? fw?.ticket_subject ?? rawPayload?.subject;
      
      const fsPriorityRaw = ticket?.priority ?? fw?.ticket_priority ?? rawPayload?.priority;
      let fsPriority = fsPriorityRaw != null ? Number(fsPriorityRaw) : undefined;
      if (typeof fsPriorityRaw === 'string' && Number.isNaN(fsPriority as number)) {
        const pMap: any = { low: 1, medium: 2, high: 3, urgent: 4 };
        fsPriority = pMap[fsPriorityRaw.toLowerCase().trim()];
      }
      
      const fsStatusRaw = ticket?.status ?? fw?.ticket_status ?? rawPayload?.status;
      let fsStatus = fsStatusRaw != null ? Number(fsStatusRaw) : undefined;
      if (typeof fsStatusRaw === 'string' && Number.isNaN(fsStatus as number)) {
        const sMap: any = { open: 2, pending: 3, resolved: 4, closed: 5 };
        fsStatus = sMap[fsStatusRaw.toLowerCase().trim()];
      }

      const hasChanges = !!(subject || fsPriority != null || fsStatus != null);

      this.logger.log(
        `📝 [CLASSIFIER] ticket_updated → UPDATE event ` +
        `[subject: ${subject ?? '-'}, priority: ${fsPriority ?? '-'}, status: ${fsStatus ?? '-'}]`,
      );

      return { type: 'update', ticketId, subject, fsPriority, fsStatus, hasChanges };
    }

    // ── 3. attachment_added ───────────────────────────────────────
    if (eventType === 'attachment_added') {
      const rawAttachments =
        rawPayload?.attachments ??
        ticket?.attachments ??
        [];

      const attachments = rawAttachments
        .filter((a: any) => a?.attachment_url ?? a?.url)
        .map((a: any) => ({
          name:           a.name ?? a.filename ?? 'attachment',
          attachment_url: a.attachment_url ?? a.url,
        }));

      this.logger.log(
        `📎 [CLASSIFIER] attachment_added → ${attachments.length} attachment(s)`,
      );

      return { type: 'attachment', ticketId, attachments };
    }

    this.logger.warn(`⚠️  [CLASSIFIER] Unknown event_type: "${eventType}"`);
    return { type: 'unknown', reason: `Unrecognized event_type: "${eventType}"` };
  }

  // ── Utility: strip HTML tags for plain-text comparison / hashing ──
  stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')  // remove tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Utility: hash a note body for dedup ───────────────────────
  hashNote(body: string): string {
    return createHash('sha256').update(body).digest('hex');
  }

  // ── Utility: parse ticket ID from any format ──────────────────
  // Handles:
  //   99001          → 99001   (number)
  //   "99001"        → 99001   (numeric string)
  //   "INC-297"      → 297     (Freshservice display ID — extract trailing digits)
  //   "TASK-001-42"  → 42      (any trailing numeric suffix)
  private parseTicketId(raw: any): number {
    if (raw == null) return NaN;

    const direct = Number(raw);
    if (!isNaN(direct)) return direct;

    // Try to extract trailing number from display IDs like "INC-297"
    if (typeof raw === 'string') {
      const match = raw.match(/(\d+)$/);
      if (match) {
        this.logger.warn(
          `⚠️  [CLASSIFIER] ticket_id "${raw}" is a display ID — extracted numeric part: ${match[1]}`,
        );
        return Number(match[1]);
      }
    }

    return NaN;
  }
}
