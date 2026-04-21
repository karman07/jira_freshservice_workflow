import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import {
  FsPairMapping,
  FsPairMappingDocument,
} from '../database/schemas/fs-pair-mapping.schema';
import { SyncLog, SyncLogDocument } from '../database/schemas/sync-log.schema';
import { CustomerConfig } from '../admin/customer-config.service';
import { FreshserviceClassifierService } from './freshservice-classifier.service';

/**
 * FsPairSyncService
 * ─────────────────
 * Orchestrates bi-directional ticket synchronization between two
 * Freshservice instances configured per customer.
 *
 *   Instance A  ←→  Instance B
 *
 * Key behaviours:
 *   1. Loop Prevention  — `lastUpdatedSource` tracks which FS last wrote.
 *                         The echo webhook from the destination is silently ignored.
 *   2. Idempotent Create — Checks for an existing FsPairMapping before
 *                          creating a mirror ticket.
 *   3. Field Mapping    — subject, description, priority, status are normalised
 *                          across both FS APIs (both use the same v2 schema).
 *   4. Note Mirroring   — Public conversations fetched and pushed; SHA-256 hash
 *                          deduplication prevents double-posting.
 *   5. Tag Guard        — Mirror tickets carry the tag `fs-pair-sync` so that
 *                          creation webhooks on the destination do NOT trigger
 *                          another create cycle.
 *
 * Priority map (FS numeric codes are identical in both instances):
 *   1 = Low | 2 = Medium | 3 = High | 4 = Urgent
 *
 * Status map:
 *   2 = Open | 3 = Pending | 4 = Resolved | 5 = Closed
 */
@Injectable()
export class FsPairSyncService {
  private readonly logger = new Logger(FsPairSyncService.name);

  // Tag injected on every mirror ticket so we can detect echo webhooks
  private static readonly PAIR_SYNC_TAG = 'fs-pair-sync';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly classifier: FreshserviceClassifierService,
    @InjectModel(FsPairMapping.name)
    private readonly pairModel: Model<FsPairMappingDocument>,
    @InjectModel(SyncLog.name)
    private readonly syncLogModel: Model<SyncLogDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Entry point — called from WebhookController
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * handleFsPairEvent()
   *
   * Routes the raw Freshservice webhook to the correct handler.
   *
   * @param rawPayload  The webhook body sent by Freshservice Automation
   * @param origin      'instanceA' | 'instanceB'  — which FS fired the event
   * @param cfg         Resolved customer credentials for both FS instances
   */
  async handleFsPairEvent(
    rawPayload: any,
    origin: 'instanceA' | 'instanceB',
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const sep = '═'.repeat(60);
    this.logger.log(
      `\n${sep}\n🔗 [FS-PAIR][${cfg.slug}] Incoming webhook from ${origin}\n${sep}`,
    );

    if (!cfg.fsPairEnabled) {
      this.logger.warn(`⚠️  [FS-PAIR][${cfg.slug}] Pair sync is DISABLED for this customer.`);
      return { status: 'skipped', message: 'FS pair sync not enabled' };
    }
    if (!cfg.fs2BaseUrl || !cfg.fs2ApiKey) {
      this.logger.warn(`⚠️  [FS-PAIR][${cfg.slug}] Instance B credentials not configured.`);
      return { status: 'skipped', message: 'Instance B credentials missing' };
    }

    const event = this.classifier.classify(rawPayload);

    if (event.type === 'unknown') {
      this.logger.warn(`⚠️  [FS-PAIR][${cfg.slug}] Classifier: ${event.reason}`);
      return { status: 'skipped', message: event.reason };
    }

    this.logger.log(
      `🎯 [FS-PAIR][${cfg.slug}] Classified → "${event.type.toUpperCase()}" | Ticket #${event.ticketId} | Origin: ${origin}`,
    );

    try {
      switch (event.type) {
        case 'create':
          return this.handleCreate(event, origin, rawPayload, cfg);

        case 'update':
          return this.handleUpdate(event, origin, rawPayload, cfg);

        case 'attachment':
          return this.handleAttachment(event, origin, cfg);

        default:
          return { status: 'skipped', message: 'Unhandled event type' };
      }
    } catch (err) {
      this.logger.error(`❌ [FS-PAIR][${cfg.slug}] Error: ${err?.message}`);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE  — mirror a new ticket to the paired instance
  // ─────────────────────────────────────────────────────────────────────────

  private async handleCreate(
    event: { type: 'create'; ticketId: number; subject: string; description: string; fsPriority: number; fsStatus: number },
    origin: 'instanceA' | 'instanceB',
    rawPayload: any,
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    // Determine which ticket ID field and which instance we write to
    const srcField  = origin === 'instanceA' ? 'instanceATicketId' : 'instanceBTicketId';
    const destField = origin === 'instanceA' ? 'instanceBTicketId' : 'instanceATicketId';

    // Idempotency — bail out if we already have a pair mapping for this ticket
    const existing = await this.pairModel.findOne({
      customerId: cfg.customerId,
      [srcField]: event.ticketId,
    });
    if (existing) {
      this.logger.warn(
        `⚠️  [FS-PAIR][${cfg.slug}] Mapping already exists for #${event.ticketId} (${origin}) — skip`,
      );
      return { status: 'skipped', message: 'Pair mapping already exists' };
    }

    // Loop-prevention: if the subject already carries our pair tag prefix, it's
    // an echo of a mirror ticket created by us — skip it.
    if (
      event.subject.includes('[FS-PAIR]') ||
      (rawPayload?.ticket?.tags ?? rawPayload?.tags ?? []).includes(FsPairSyncService.PAIR_SYNC_TAG)
    ) {
      this.logger.warn(`🔄 [FS-PAIR][${cfg.slug}] Loop prevention: mirror-origin ticket #${event.ticketId} — skip`);
      return { status: 'skipped', message: 'Loop prevention: mirror-origin ticket' };
    }

    // Pick destination credentials
    const [destUrl, destKey, destFallback] = origin === 'instanceA'
      ? [cfg.fs2BaseUrl,            cfg.fs2ApiKey,            cfg.fs2FallbackEmail]
      : [cfg.freshserviceBaseUrl,   cfg.freshserviceApiKey,   cfg.fallbackEmail];

    this.logger.log(
      `🚀 [FS-PAIR][${cfg.slug}] Mirroring ticket #${event.ticketId} from ${origin} → ${destUrl}`,
    );

    const payload = {
      subject:     `[FS-PAIR] ${event.subject}`,
      description: event.description || 'No description.',
      priority:    event.fsPriority ?? 2,
      status:      2, // Always open on creation
      email:       destFallback || 'support@example.com',
      tags:        [FsPairSyncService.PAIR_SYNC_TAG],
    };

    try {
      const mirrorTicket = await this.fsRequest(destUrl, destKey, 'post', '/api/v2/tickets', payload);
      const mirrorId: number = mirrorTicket?.ticket?.id;

      if (!mirrorId) throw new Error('Mirror ticket creation returned no ID');

      await this.pairModel.create({
        customerId:          cfg.customerId,
        [srcField]:          event.ticketId,
        [destField]:         mirrorId,
        lastUpdatedSource:   origin,
        subject:             event.subject,
        instanceAStatus:     origin === 'instanceA' ? event.fsStatus : 2,
        instanceBStatus:     origin === 'instanceB' ? event.fsStatus : 2,
        instanceAPriority:   origin === 'instanceA' ? event.fsPriority : 2,
        instanceBPriority:   origin === 'instanceB' ? event.fsPriority : 2,
      });

      await this.log({
        customerId: cfg.customerId,
        eventType:  'fs_pair_ticket_created',
        source:     origin,
        destination: origin === 'instanceA' ? 'instanceB' : 'instanceA',
        freshserviceTicketId: event.ticketId,
        status:     'success',
        sentPayload: { subject: payload.subject, mirrorId },
      });

      this.logger.log(
        `✅ [FS-PAIR][${cfg.slug}] #${event.ticketId} → mirror #${mirrorId} CREATED`,
      );
      return { status: 'success', message: `Mirror ticket #${mirrorId} created` };

    } catch (err) {
      await this.log({
        customerId: cfg.customerId,
        eventType:  'fs_pair_ticket_created',
        source:     origin,
        destination: origin === 'instanceA' ? 'instanceB' : 'instanceA',
        freshserviceTicketId: event.ticketId,
        status:     'failed',
        errorMessage: err?.message,
        payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE — propagate field changes and new notes to the paired instance
  // ─────────────────────────────────────────────────────────────────────────

  private async handleUpdate(
    event: { type: 'update'; ticketId: number; subject?: string; fsPriority?: number; fsStatus?: number; hasChanges: boolean },
    origin: 'instanceA' | 'instanceB',
    rawPayload: any,
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const srcField  = origin === 'instanceA' ? 'instanceATicketId' : 'instanceBTicketId';
    const destField = origin === 'instanceA' ? 'instanceBTicketId' : 'instanceATicketId';

    const mapping = await this.pairModel.findOne({
      customerId: cfg.customerId,
      [srcField]: event.ticketId,
    });

    if (!mapping) {
      this.logger.warn(`⚠️  [FS-PAIR][${cfg.slug}] No pair mapping for ${origin} #${event.ticketId} — skipping`);
      return { status: 'skipped', message: 'No pair mapping found' };
    }

    const destTicketId: number = (mapping as any)[destField];

    // Pick destination credentials
    const [srcUrl, srcKey] = origin === 'instanceA'
      ? [cfg.freshserviceBaseUrl, cfg.freshserviceApiKey]
      : [cfg.fs2BaseUrl,          cfg.fs2ApiKey];
    const [destUrl, destKey] = origin === 'instanceA'
      ? [cfg.fs2BaseUrl,          cfg.fs2ApiKey]
      : [cfg.freshserviceBaseUrl, cfg.freshserviceApiKey];

    // ── STEP 1: ALWAYS sync notes first (regardless of field changes) ──────
    await this.syncNotes(
      event.ticketId, destTicketId,
      srcUrl, srcKey,
      destUrl, destKey,
      mapping, origin, cfg,
    );

    // ── STEP 2: Loop prevention for metadata fields ────────────────────────
    if (mapping.lastUpdatedSource === origin) {
      // The same origin triggered the update — could be an echo from our own write.
      // We already synced notes above; skip field updates.
      this.logger.warn(`🔄 [FS-PAIR][${cfg.slug}] Metadata loop guard: last source = ${origin}`);
      await this.pairModel.updateOne(
        { customerId: cfg.customerId, [srcField]: event.ticketId },
        { lastUpdatedSource: origin === 'instanceA' ? 'instanceB' : 'instanceA' },
      );
      return { status: 'skipped', message: 'Metadata loop prevention' };
    }

    if (!event.hasChanges) {
      return { status: 'skipped', message: 'No field changes detected' };
    }

    // ── STEP 3: Build update payload for destination ───────────────────────
    const updatePayload: any = {};
    const cachedStatus   = origin === 'instanceA' ? mapping.instanceAStatus   : mapping.instanceBStatus;
    const cachedPriority = origin === 'instanceA' ? mapping.instanceAPriority : mapping.instanceBPriority;

    const statusChanged   = event.fsStatus   != null && event.fsStatus   !== cachedStatus;
    const priorityChanged = event.fsPriority != null && event.fsPriority !== cachedPriority;
    const subjectChanged  = event.subject    != null && event.subject    !== mapping.subject;

    if (subjectChanged)  updatePayload.subject  = `[FS-PAIR] ${event.subject}`;
    if (priorityChanged) updatePayload.priority = event.fsPriority;
    if (statusChanged)   updatePayload.status   = event.fsStatus;

    if (Object.keys(updatePayload).length === 0) {
      return { status: 'skipped', message: 'Metadata unchanged vs cache' };
    }

    try {
      await this.fsRequest(destUrl, destKey, 'put', `/api/v2/tickets/${destTicketId}`, updatePayload);

      const mappingUpdate: any = {
        lastUpdatedSource: origin,
        lastSyncedAt:      new Date(),
      };
      if (statusChanged)   mappingUpdate[origin === 'instanceA' ? 'instanceAStatus'   : 'instanceBStatus']   = event.fsStatus;
      if (priorityChanged) mappingUpdate[origin === 'instanceA' ? 'instanceAPriority' : 'instanceBPriority'] = event.fsPriority;
      if (subjectChanged)  mappingUpdate.subject = event.subject;

      await this.pairModel.updateOne(
        { customerId: cfg.customerId, [srcField]: event.ticketId },
        mappingUpdate,
      );

      await this.log({
        customerId: cfg.customerId,
        eventType:  'fs_pair_ticket_updated',
        source:     origin,
        destination: origin === 'instanceA' ? 'instanceB' : 'instanceA',
        freshserviceTicketId: event.ticketId,
        status:     'success',
        sentPayload: updatePayload,
      });

      this.logger.log(
        `✅ [FS-PAIR][${cfg.slug}] Fields updated: ${origin} #${event.ticketId} → dest #${destTicketId}`,
      );
      return { status: 'success', message: `Fields updated on mirror #${destTicketId}` };

    } catch (err) {
      await this.log({
        customerId: cfg.customerId,
        eventType:  'fs_pair_ticket_updated',
        source:     origin,
        destination: origin === 'instanceA' ? 'instanceB' : 'instanceA',
        freshserviceTicketId: event.ticketId,
        status:     'failed',
        errorMessage: err?.message,
        payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ATTACHMENT — link back attachment notes to the paired ticket
  // ─────────────────────────────────────────────────────────────────────────

  private async handleAttachment(
    event: { type: 'attachment'; ticketId: number; attachments: Array<{ name: string; attachment_url: string }> },
    origin: 'instanceA' | 'instanceB',
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const srcField  = origin === 'instanceA' ? 'instanceATicketId' : 'instanceBTicketId';
    const destField = origin === 'instanceA' ? 'instanceBTicketId' : 'instanceATicketId';

    const mapping = await this.pairModel.findOne({
      customerId: cfg.customerId,
      [srcField]: event.ticketId,
    });
    if (!mapping) return { status: 'skipped', message: 'No pair mapping for attachment' };
    if (event.attachments.length === 0) return { status: 'skipped', message: 'No attachments' };

    const destTicketId: number = (mapping as any)[destField];
    const [destUrl, destKey] = origin === 'instanceA'
      ? [cfg.fs2BaseUrl,          cfg.fs2ApiKey]
      : [cfg.freshserviceBaseUrl, cfg.freshserviceApiKey];

    const links = event.attachments
      .map((a) => `<li><a href="${a.attachment_url}">${a.name}</a></li>`)
      .join('');
    const body =
      `<p><strong>📎 Attachments synced from paired Freshservice (${origin})</strong></p>` +
      `<ul>${links}</ul>`;

    try {
      await this.fsRequest(destUrl, destKey, 'post', `/api/v2/tickets/${destTicketId}/notes`, {
        body,
        private: false,
      });

      this.logger.log(
        `✅ [FS-PAIR][${cfg.slug}] Attachment note posted to #${destTicketId}`,
      );
      return { status: 'success', message: `Attachment note posted to mirror #${destTicketId}` };
    } catch (err) {
      this.logger.error(`❌ [FS-PAIR] Attachment note failed: ${err?.message}`);
      return { status: 'failed', message: err?.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NOTE SYNC — pull public conversations from source and push to destination
  // ─────────────────────────────────────────────────────────────────────────

  private async syncNotes(
    srcTicketId: number,
    destTicketId: number,
    srcUrl: string, srcKey: string,
    destUrl: string, destKey: string,
    mapping: FsPairMappingDocument,
    origin: 'instanceA' | 'instanceB',
    cfg: CustomerConfig,
  ): Promise<void> {
    // Fetch conversations from the source ticket
    let conversations: any[] = [];
    try {
      const result = await this.fsRequest(
        srcUrl, srcKey, 'get',
        `/api/v2/tickets/${srcTicketId}?include=conversations`,
      );
      conversations = result?.ticket?.conversations ?? [];
    } catch (err) {
      this.logger.error(`❌ [FS-PAIR][${cfg.slug}] Could not fetch conversations for #${srcTicketId}: ${err?.message}`);
      return;
    }

    const publicNotes = conversations
      .filter((c: any) => c.private === false)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const lastNoteIdField    = origin === 'instanceA' ? 'lastNoteIdAtoB' : 'lastNoteIdBtoA';
    let latestProcessedId    = (mapping as any)[lastNoteIdField] ?? 0;
    let newNoteCount         = 0;

    for (const note of publicNotes) {
      if (note.id <= latestProcessedId) continue;

      let body = note.body_text || note.body || '';
      body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!body) { latestProcessedId = note.id; continue; }

      // Skip notes that we injected ourselves (loop prevention)
      if (body.startsWith('[FS-PAIR]') || body.startsWith('📎 Attachments synced from paired')) {
        latestProcessedId = note.id;
        continue;
      }

      const hash = createHash('sha256').update(body).digest('hex');
      if (mapping.lastNoteHash === hash) {
        latestProcessedId = note.id;
        continue;
      }

      const agentName = note.from_email || 'Freshservice (paired)';
      const noteBody  = `<p><strong>[FS-PAIR] From ${origin} — ${agentName}</strong></p><p>${body}</p>`;

      try {
        await this.fsRequest(destUrl, destKey, 'post', `/api/v2/tickets/${destTicketId}/notes`, {
          body:    noteBody,
          private: false,
        });

        latestProcessedId = note.id;
        await this.pairModel.updateOne(
          { customerId: cfg.customerId, _id: mapping._id },
          { [lastNoteIdField]: latestProcessedId, lastNoteHash: hash, lastSyncedAt: new Date() },
        );

        await this.log({
          customerId: cfg.customerId,
          eventType:  'fs_pair_note_synced',
          source:     origin,
          destination: origin === 'instanceA' ? 'instanceB' : 'instanceA',
          freshserviceTicketId: srcTicketId,
          status:     'success',
          sentPayload: { noteId: note.id, body: body.substring(0, 100) },
        });

        newNoteCount++;
      } catch (err) {
        this.logger.error(`❌ [FS-PAIR] Failed to push note #${note.id}: ${err?.message}`);
      }
    }

    if (newNoteCount > 0) {
      this.logger.log(`✅ [FS-PAIR][${cfg.slug}] Synced ${newNoteCount} note(s) to mirror #${destTicketId}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async fsRequest(
    baseUrl: string,
    apiKey: string,
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    data?: any,
  ): Promise<any> {
    const url     = `${baseUrl}${path}`;
    const encoded = Buffer.from(`${apiKey}:X`).toString('base64');
    const headers: any = {
      Authorization:  `Basic ${encoded}`,
      'Content-Type': 'application/json',
    };

    this.logger.log(`📡 [FS-PAIR] ${method.toUpperCase()} → ${url}`);

    try {
      const res = await firstValueFrom(
        this.httpService.request({ method, url, data, headers }),
      );
      return res.data;
    } catch (err) {
      const status = err?.response?.status ?? 'UNKNOWN';
      const msg    = err?.response?.data?.description || err?.response?.data?.message || err?.message;
      this.logger.error(`❌ [FS-PAIR] ${method.toUpperCase()} ${url} → [${status}] ${msg}`);
      throw err;
    }
  }

  private async log(data: {
    customerId?: string;
    eventType:   string;
    source:      string;
    destination: string;
    freshserviceTicketId?: number;
    status:      string;
    errorMessage?: string;
    payloadSnapshot?: Record<string, any>;
    sentPayload?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.syncLogModel.create({
        ...data,
        // Use consistent source/destination labels
        jiraIssueId:  undefined,
        jiraIssueKey: undefined,
      });
    } catch (err) {
      this.logger.error(`⚠️  [FS-PAIR] Failed to write sync log: ${err?.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Analytics helper — pair mapping stats for the admin dashboard
  // ─────────────────────────────────────────────────────────────────────────

  async getPairStats(customerId: string) {
    const total = await this.pairModel.countDocuments({ customerId });
    const recent = await this.pairModel
      .find({ customerId })
      .sort({ lastSyncedAt: -1 })
      .limit(10)
      .lean();
    return { total, recent };
  }
}
