import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FreshserviceService } from '../freshservice/freshservice.service';
import { FreshserviceClassifierService } from '../freshservice/freshservice-classifier.service';
import { JiraService } from '../jira/jira.service';
import {
  TicketMapping,
  TicketMappingDocument,
} from '../database/schemas/ticket-mapping.schema';
import { SyncLog, SyncLogDocument } from '../database/schemas/sync-log.schema';
import { createHash } from 'crypto';

/**
 * SyncService
 * ───────────
 * The orchestration brain of the entire integration.
 *
 * Responsibilities:
 *   1. Loop Prevention   — Checks `lastUpdatedSource` in MongoDB before syncing.
 *                          If FS triggered the event, we skip pushing back to FS,
 *                          and vice versa for Jira.
 *   2. Ticket Mapping    — Maintains the Jira ↔ Freshservice ID link in MongoDB.
 *   3. Event Routing     — Routes each event type to the correct API call.
 *   4. Audit Logging     — Every sync attempt (success / failure / skipped)
 *                          is written to the sync_logs collection.
 *
 * Supported Jira → Freshservice Events:
 *   issue_created        → createTicket()
 *   issue_updated        → updateTicket() + status/priority updates
 *   comment_created      → addNote()
 *   attachment_added     → addAttachmentNote()
 *
 * Supported Freshservice → Jira Events:
 *   ticket_created       → createIssue()
 *   ticket_updated       → updateIssue() + transitionIssue()
 *   note_created         → addComment()
 *   attachment_added     → addAttachmentComment()
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly freshserviceService: FreshserviceService,
    private readonly jiraService: JiraService,
    private readonly classifier: FreshserviceClassifierService,
    private readonly configService: ConfigService,
    @InjectModel(TicketMapping.name)
    private readonly ticketMappingModel: Model<TicketMappingDocument>,
    @InjectModel(SyncLog.name)
    private readonly syncLogModel: Model<SyncLogDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // ① JIRA → FRESHSERVICE
  // ─────────────────────────────────────────────────────────────

  /**
   * handleJiraEvent()
   * Entry point for all events coming from the Jira webhook.
   */
  async handleJiraEvent(
    webhookEvent: string,
    payload: any,
  ): Promise<{ status: string; message: string }> {
    this.logger.log(
      `\n${'─'.repeat(60)}\n🎯 [SYNC] Jira Event: "${webhookEvent}"\n${'─'.repeat(60)}`,
    );

    const issue = payload?.issue;
    const jiraIssueKey: string = issue?.key;
    const jiraIssueId: string = issue?.id;
    const fields = issue?.fields ?? {};

    if (!jiraIssueKey || !jiraIssueId) {
      this.logger.warn('⚠️  [SYNC] Jira payload missing issue key/id — skipping.');
      return { status: 'skipped', message: 'Missing issue key/id' };
    }

    // ── Event: issue_created ────────────────────────────────────
    if (webhookEvent === 'jira:issue_created') {
      return this.handleJiraIssueCreated(jiraIssueKey, jiraIssueId, fields, payload);
    }

    // ── Event: issue_updated ────────────────────────────────────
    if (webhookEvent === 'jira:issue_updated') {
      return this.handleJiraIssueUpdated(jiraIssueKey, jiraIssueId, fields, payload);
    }

    // ── Event: comment_created / comment_updated ─────────────────────
    if (
      webhookEvent === 'comment_created' ||
      webhookEvent === 'comment_updated'
    ) {
      return this.handleJiraCommentCreated(jiraIssueKey, jiraIssueId, payload);
    }

    // ── Event: attachment_created ───────────────────────────────
    // NOTE: jira:attachment_created webhooks often arrive empty (no attachment
    // data in the payload). Attachments are reliably synced by detecting
    // changelog.field === "Attachment" inside jira:issue_updated. Ignore this.
    if (webhookEvent === 'jira:attachment_created') {
      this.logger.log(
        `ℹ️  [SYNC] jira:attachment_created ignored — attachments handled via issue_updated changelog`,
      );
      return { status: 'skipped', message: 'attachment_created ignored — use issue_updated' };
    }

    this.logger.warn(`⚠️  [SYNC] Unhandled Jira event type: "${webhookEvent}"`);
    return { status: 'skipped', message: `Unhandled event: ${webhookEvent}` };
  }

  // ─── issue_created ─────────────────────────────────────────────
  private async handleJiraIssueCreated(
    jiraIssueKey: string,
    jiraIssueId: string,
    fields: any,
    payload: any,
  ): Promise<{ status: string; message: string }> {
    // ── Idempotency guard ──────────────────────────────────────────
    const existing = await this.ticketMappingModel.findOne({ jiraIssueId });
    if (existing) {
      this.logger.warn(
        `⚠️  [SYNC] Mapping already exists for ${jiraIssueKey} → FS#${existing.freshserviceTicketId} — skipping duplicate create`,
      );
      return { status: 'skipped', message: 'Mapping already exists' };
    }

    const summary = fields?.summary ?? 'No Subject';

    // ── Loop prevention ──────────────────────────────────────────
    // If this Jira issue was CREATED BY US from a Freshservice ticket its
    // summary will start with "[FS-XXX]" (set by processCreate). Syncing it
    // back would create an infinite loop.
    if (/^\[FS-\d+\]/.test(summary)) {
      this.logger.warn(
        `🔄 [SYNC] Loop prevention: ${jiraIssueKey} was created by FS sync ("${summary}") — skipping`,
      );
      return { status: 'skipped', message: 'Loop prevention: issue originated from Freshservice' };
    }

    // Also skip if the issue carries our sync tags (belt & suspenders)
    const issueTags: string[] = fields?.labels ?? [];
    if (issueTags.includes('freshservice-sync') || issueTags.includes('jira-sync')) {
      this.logger.warn(
        `🔄 [SYNC] Loop prevention: ${jiraIssueKey} has sync label — skipping`,
      );
      return { status: 'skipped', message: 'Loop prevention: sync label detected' };
    }

    // ── Safe priority + status mapping ───────────────────────────────
    // PRIORITY_MAP and STATUS_MAP return undefined for unknown names;
    // Number(undefined) = NaN which causes Mongoose cast errors.
    // Always fall back to valid FS defaults: priority=2 (Medium), status=2 (Open).
    const priorityName = fields?.priority?.name ?? '';
    const statusName   = fields?.status?.name   ?? '';
    const priority = Math.max(1, Math.min(4,
      Number(FreshserviceService.PRIORITY_MAP[priorityName]) || 2,
    ));
    const status = Math.max(2, Math.min(5,
      Number(FreshserviceService.STATUS_MAP[statusName]) || 2,
    ));

    const description = this.extractJiraDescription(fields?.description);
    const email =
      fields?.reporter?.emailAddress ??
      this.configService.get<string>('FALLBACK_EMAIL') ??
      'karmansingharora01@gmail.com';

    this.logger.log(
      `📋 [SYNC] Creating FS ticket for ${jiraIssueKey}: "${summary}" ` +
      `[Priority: ${priorityName}(${priority})] [Status: ${statusName}(${status})]`,
    );

    try {
      const fsTicket = await this.freshserviceService.createTicket({
        subject: `[JIRA-${jiraIssueKey}] ${summary}`,
        description,
        priority,
        status,
        email,
        tags: ['jira-sync', jiraIssueKey],
      });

      // Persist mapping
      await this.ticketMappingModel.create({
        jiraIssueKey,
        jiraIssueId,
        freshserviceTicketId: fsTicket.id,
        lastUpdatedSource: 'jira',
        summary,
        jiraStatus: statusName || 'Unknown',
        freshserviceStatus: status,          // guaranteed 2–5
        jiraPriority: priorityName || 'Unknown',
        freshservicePriority: priority,      // guaranteed 1–4
      });

      await this.logSync({
        eventType: 'issue_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: fsTicket.id,
        status: 'success',
        payloadSnapshot: { summary, priority, status },
        sentPayload: { subject: `[JIRA-${jiraIssueKey}] ${summary}`, priority, status },
      });

      this.logger.log(
        `✅ [SYNC] ${jiraIssueKey} → FS Ticket #${fsTicket.id} CREATED successfully`,
      );
      return {
        status: 'success',
        message: `FS Ticket #${fsTicket.id} created for ${jiraIssueKey}`,
      };
    } catch (err) {
      await this.logSync({
        eventType: 'issue_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        status: 'failed',
        errorMessage: err?.message,
        payloadSnapshot: payload,
      });
      throw err;
    }
  }

  // ─── issue_updated ─────────────────────────────────────────────
  private async handleJiraIssueUpdated(
    jiraIssueKey: string,
    jiraIssueId: string,
    fields: any,
    payload: any,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ jiraIssueId });

    if (!mapping) {
      this.logger.warn(
        `⚠️  [SYNC] No mapping for ${jiraIssueKey} on issue_updated — skipping`,
      );
      return { status: 'skipped', message: 'No ticket mapping' };
    }

    // ── Loop Prevention ─────────────────────────────────────────
    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(
        `🔄 [SYNC] Loop prevention: ${jiraIssueKey} was last updated by Freshservice — skipping sync back`,
      );
      await this.ticketMappingModel.updateOne(
        { jiraIssueId },
        { lastUpdatedSource: 'jira' },
      );
      return { status: 'skipped', message: 'Loop prevention triggered' };
    }

    const fsTicketId = mapping.freshserviceTicketId;
    const changedFields = payload?.changelog?.items ?? [];

    this.logger.log(
      `📋 [SYNC] Updating FS #${fsTicketId} for ${jiraIssueKey} — ` +
      `Changed fields: [${changedFields.map((c: any) => c.field).join(', ')}]`,
    );

    // ── Attachment changes come via issue_updated changelog ───────
    // jira:attachment_created is unreliable (often empty). The reliable
    // signal is changelog.field === "Attachment" inside issue_updated.
    const hasAttachmentChange = changedFields.some(
      (c: any) => c.field?.toLowerCase() === 'attachment',
    );
    if (hasAttachmentChange) {
      this.logger.log(`📎 [SYNC] Attachment change in changelog — routing to attachment handler`);
      return this.handleJiraAttachmentAdded(jiraIssueKey, jiraIssueId, fields, payload);
    }

    // ── Regular field update ─────────────────────────────────────
    const updatePayload: any = {};

    for (const change of changedFields) {
      const field = change.field?.toLowerCase();

      if (field === 'summary') {
        updatePayload.subject = `[JIRA-${jiraIssueKey}] ${change.toString ?? fields?.summary}`;
      }
      if (field === 'description') {
        updatePayload.description = this.extractJiraDescription(fields?.description);
      }
      if (field === 'priority') {
        // NaN-safe: PRIORITY_MAP returns undefined for unknown names → NaN → fallback 2
        const newPriority = Math.max(1, Math.min(4,
          Number(FreshserviceService.PRIORITY_MAP[change.toString ?? fields?.priority?.name]) || 2,
        ));
        updatePayload.priority = newPriority;
        this.logger.log(`   🎯 Priority: "${change.fromString}" → "${change.toString}" (FS: ${newPriority})`);
      }
      if (field === 'status') {
        // NaN-safe: STATUS_MAP returns undefined for unknown names → NaN → fallback 2
        const newStatus = Math.max(2, Math.min(5,
          Number(FreshserviceService.STATUS_MAP[change.toString ?? fields?.status?.name]) || 2,
        ));
        updatePayload.status = newStatus;
        this.logger.log(`   🎯 Status: "${change.fromString}" → "${change.toString}" (FS: ${newStatus})`);
      }
    }

    // If nothing to update (e.g. only a label/sprint change), skip
    if (Object.keys(updatePayload).length === 0) {
      this.logger.log(`ℹ️  [SYNC] No relevant field changes for FS — skipping update`);
      return { status: 'skipped', message: 'No relevant field changes' };
    }

    try {
      await this.freshserviceService.updateTicket(fsTicketId, updatePayload);

      await this.ticketMappingModel.updateOne(
        { jiraIssueId },
        {
          lastUpdatedSource: 'jira',
          lastSyncedAt: new Date(),
          ...(updatePayload.status   && { freshserviceStatus:   updatePayload.status }),
          ...(updatePayload.priority && { freshservicePriority: updatePayload.priority }),
          ...(updatePayload.subject  && { summary:              updatePayload.subject }),
        },
      );

      await this.logSync({
        eventType: 'issue_updated',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: fsTicketId,
        status: 'success',
        payloadSnapshot: { changedFields: changedFields.map((c: any) => c.field) },
        sentPayload: updatePayload,
      });

      this.logger.log(`✅ [SYNC] ${jiraIssueKey} → FS #${fsTicketId} UPDATED successfully`);
      return { status: 'success', message: `FS #${fsTicketId} updated for ${jiraIssueKey}` };
    } catch (err) {
      await this.logSync({
        eventType: 'issue_updated',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: fsTicketId,
        status: 'failed',
        errorMessage: err?.message,
        payloadSnapshot: payload,
      });
      throw err;
    }
  }

  // ─── comment_created ───────────────────────────────────────────
  private async handleJiraCommentCreated(
    jiraIssueKey: string,
    jiraIssueId: string,
    payload: any,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ jiraIssueId });
    if (!mapping) {
      this.logger.warn(
        `⚠️  [SYNC] No mapping for ${jiraIssueKey} on comment — skipping`,
      );
      return { status: 'skipped', message: 'No ticket mapping found' };
    }

    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(
        `🔄 [SYNC] Comment loop prevention for ${jiraIssueKey}`,
      );
      await this.ticketMappingModel.updateOne(
        { jiraIssueId },
        { lastUpdatedSource: 'jira' },
      );
      return { status: 'skipped', message: 'Comment loop prevention' };
    }

    const comment = payload?.comment;
    const rawBody = comment?.body;
    const commentBody = this.extractJiraDescription(rawBody);
    const authorName = comment?.author?.displayName ?? 'Jira User';

    this.logger.log(
      `💬 [SYNC] Comment from ${authorName} on ${jiraIssueKey} → FS #${mapping.freshserviceTicketId}`,
    );

    try {
      await this.freshserviceService.addNote(
        mapping.freshserviceTicketId,
        commentBody,
        { isPrivate: false, authorName },
      );

      await this.ticketMappingModel.updateOne(
        { jiraIssueId },
        { lastUpdatedSource: 'jira', lastSyncedAt: new Date() },
      );

      await this.logSync({
        eventType: 'comment_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'success',
        sentPayload: { body: commentBody.substring(0, 200) },
      });

      this.logger.log(
        `✅ [SYNC] Comment synced: ${jiraIssueKey} → FS #${mapping.freshserviceTicketId}`,
      );
      return { status: 'success', message: 'Comment note added to Freshservice' };
    } catch (err) {
      await this.logSync({
        eventType: 'comment_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'failed',
        errorMessage: err?.message,
      });
      throw err;
    }
  }

  // ─── attachment_added ──────────────────────────────────────────
  private async handleJiraAttachmentAdded(
    jiraIssueKey: string,
    jiraIssueId: string,
    fields: any,
    payload: any,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ jiraIssueId });
    if (!mapping) {
      return { status: 'skipped', message: 'No ticket mapping found' };
    }

    const attachments: Array<{ filename: string; content_url: string }> =
      (fields?.attachment ?? []).map((a: any) => ({
        filename: a.filename,
        content_url: a.content,
      }));

    if (attachments.length === 0) {
      return { status: 'skipped', message: 'No attachments found in payload' };
    }

    try {
      const result = await this.freshserviceService.uploadAttachments(
        mapping.freshserviceTicketId,
        attachments,
      );

      await this.logSync({
        eventType: 'attachment_added',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'success',
        sentPayload: {
          attachmentCount: attachments.length,
          uploaded: result.uploaded,
          fallback: result.fallback,
        },
      });

      return {
        status: 'success',
        message: `${result.uploaded} attachment(s) uploaded to FS, ${result.fallback} via link note`,
      };
    } catch (err) {
      await this.logSync({
        eventType: 'attachment_added',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'failed',
        errorMessage: err?.message,
      });
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ② FRESHSERVICE → JIRA  (3-webhook model)
  //
  //    All FS events pass through ONE entry point → classifier
  //    routes to processCreate | processUpdate | processNote | processAttachment
  //
  //    Loop prevention: mapping.lastUpdatedSource === 'freshservice'
  //      → SKIP (Jira update would echo back to us)
  // ─────────────────────────────────────────────────────────────

  /**
   * handleFreshserviceEvent()
   * ─────────────────────────
   * SINGLE entry point for all Freshservice webhook payloads.
   * Does NOT accept an event_type parameter — classification is
   * handled entirely by FreshserviceClassifierService.
   */
  async handleFreshserviceEvent(
    rawPayload: any,
  ): Promise<{ status: string; message: string }> {
    const separator = '═'.repeat(60);
    this.logger.log(`\n${separator}\n📥 [FS→JIRA] Incoming Freshservice webhook\n${separator}`);

    // ── Step 1: Classify ─────────────────────────────────────────
    const event = this.classifier.classify(rawPayload);

    if (event.type === 'unknown') {
      this.logger.warn(`⚠️  [FS→JIRA] Skipped: ${event.reason}`);
      return { status: 'skipped', message: event.reason };
    }

    this.logger.log(
      `🎯 [FS→JIRA] Classified as: "${event.type.toUpperCase()}" | Ticket #${event.ticketId}`,
    );

    // ── Step 2: Fetch mapping ONCE ────────────────────────────────
    // processCreate doesn't need an existing mapping,
    // all other processors do.
    let mapping =
      event.type !== 'create'
        ? await this.ticketMappingModel.findOne({
            freshserviceTicketId: event.ticketId,
          })
        : null;

    // ── Step 3: Route to the correct processor ────────────────────
    try {
      switch (event.type) {
        case 'create':
          return this.processCreate(event, rawPayload);

        case 'update':
          if (!mapping) {
            this.logger.warn(
              `⚠️  [FS→JIRA] No mapping for FS#${event.ticketId} — attempting create`,
            );
            return this.processCreate(
              {
                type: 'create',
                ticketId: event.ticketId,
                subject:     event.subject ?? 'No Subject',
                description: '',
                fsPriority:  event.fsPriority ?? 2,
                fsStatus:    event.fsStatus   ?? 2,
              },
              rawPayload,
            );
          }
          return this.processUpdate(event, mapping, rawPayload);

        case 'note':
          if (!mapping) {
            this.logger.warn(`⚠️  [FS→JIRA] No mapping for FS#${event.ticketId} note — skipping`);
            return { status: 'skipped', message: 'No mapping for note' };
          }
          return this.processNote(event, mapping);

        case 'attachment':
          if (!mapping) {
            this.logger.warn(`⚠️  [FS→JIRA] No mapping for FS#${event.ticketId} attachment — skipping`);
            return { status: 'skipped', message: 'No mapping for attachment' };
          }
          return this.processAttachment(event, mapping);
      }
    } catch (err) {
      this.logger.error(`❌ [FS→JIRA] Processor error: ${err?.message}`);
      throw err;
    }
  }

  // ─── processCreate ────────────────────────────────────────────
  private async processCreate(
    event: { type: 'create'; ticketId: number; subject: string; description: string; fsPriority: number; fsStatus: number },
    rawPayload: any,
  ): Promise<{ status: string; message: string }> {
    // Idempotency guard
    const existing = await this.ticketMappingModel.findOne({
      freshserviceTicketId: event.ticketId,
    });
    if (existing) {
      this.logger.warn(
        `⚠️  [processCreate] Mapping already exists: FS#${event.ticketId} → ${existing.jiraIssueKey}`,
      );
      return { status: 'skipped', message: 'Mapping already exists' };
    }

    const priorityName = JiraService.PRIORITY_MAP[event.fsPriority] ?? 'Medium';

    this.logger.log(
      `🚀 [processCreate] FS #${event.ticketId} → Jira | ` +
      `"${event.subject}" | Priority: ${event.fsPriority}→${priorityName}`,
    );

    try {
      const jiraIssue = await this.jiraService.createIssue({
        summary:     `[FS-${event.ticketId}] ${event.subject}`,
        description: event.description,
        priority:    priorityName,
      });

      await this.ticketMappingModel.create({
        jiraIssueKey:          jiraIssue.key,
        jiraIssueId:           jiraIssue.id,
        freshserviceTicketId:  event.ticketId,
        lastUpdatedSource:     'freshservice',
        summary:               event.subject,
        jiraPriority:          priorityName,
        freshservicePriority:  event.fsPriority,
        freshserviceStatus:    event.fsStatus,
      });

      await this.logSync({
        eventType: 'ticket_created', source: 'freshservice', destination: 'jira',
        jiraIssueId: jiraIssue.id, jiraIssueKey: jiraIssue.key,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: { summary: `[FS-${event.ticketId}] ${event.subject}`, priority: priorityName },
      });

      this.logger.log(`✅ [processCreate] FS #${event.ticketId} → Jira ${jiraIssue.key} CREATED`);
      return { status: 'success', message: `Jira ${jiraIssue.key} created for FS #${event.ticketId}` };

    } catch (err) {
      await this.logSync({
        eventType: 'ticket_created', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: event.ticketId, status: 'failed', errorMessage: err?.message,
        payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─── processUpdate ────────────────────────────────────────────
  private async processUpdate(
    event: { type: 'update'; ticketId: number; subject?: string; fsPriority?: number; fsStatus?: number; hasChanges: boolean },
    mapping: TicketMappingDocument,
    rawPayload: any,
  ): Promise<{ status: string; message: string }> {
    // ── Loop prevention ───────────────────────────────────────────
    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(
        `🔄 [processUpdate] Loop prevention: FS#${event.ticketId} last touched by Freshservice — skip`,
      );
      // Reset so next genuine Jira update can pass through
      await this.ticketMappingModel.updateOne(
        { freshserviceTicketId: event.ticketId },
        { lastUpdatedSource: 'freshservice' },  // already freshservice, idempotent
      );
      return { status: 'skipped', message: 'Loop prevention triggered' };
    }

    // ── Value comparison — skip if nothing changed ─────────────────
    if (!event.hasChanges) {
      this.logger.log(`ℹ️  [processUpdate] No relevant field changes — skipping Jira update`);
      return { status: 'skipped', message: 'No changes detected' };
    }

    const jiraIssueKey    = mapping.jiraIssueKey;
    const newPriorityName = event.fsPriority != null
      ? JiraService.PRIORITY_MAP[event.fsPriority]
      : undefined;
    const transitionTarget = event.fsStatus != null
      ? JiraService.STATUS_NAME_MAP[event.fsStatus]
      : undefined;

    // Skip if values haven't actually changed vs what we have cached
    const priorityChanged = newPriorityName && newPriorityName !== mapping.jiraPriority;
    const statusChanged   = event.fsStatus  && event.fsStatus  !== mapping.freshserviceStatus;
    const subjectChanged  = event.subject   && event.subject   !== mapping.summary;

    if (!priorityChanged && !statusChanged && !subjectChanged) {
      this.logger.log(
        `ℹ️  [processUpdate] Cached values match incoming — no API call needed ` +
        `[priority: ${newPriorityName}, status: ${event.fsStatus}, subject unchanged]`,
      );
      return { status: 'skipped', message: 'Values unchanged (cached comparison)' };
    }

    const updateData: any = {};
    if (subjectChanged)  updateData.summary  = `[FS-${event.ticketId}] ${event.subject}`;
    if (priorityChanged) updateData.priority = newPriorityName;

    this.logger.log(
      `📋 [processUpdate] Updating Jira ${jiraIssueKey} for FS #${event.ticketId} | ` +
      `subject: ${subjectChanged ? '✓' : '-'} | ` +
      `priority: ${priorityChanged ? `${mapping.jiraPriority}→${newPriorityName}` : '-'} | ` +
      `status: ${statusChanged ? `${mapping.freshserviceStatus}→${event.fsStatus}` : '-'}`,
    );

    try {
      if (Object.keys(updateData).length > 0) {
        await this.jiraService.updateIssue(jiraIssueKey, updateData);
      }
      if (transitionTarget && statusChanged) {
        await this.jiraService.transitionIssue(jiraIssueKey, transitionTarget);
      }

      await this.ticketMappingModel.updateOne(
        { freshserviceTicketId: event.ticketId },
        {
          lastUpdatedSource: 'freshservice',
          lastSyncedAt:      new Date(),
          ...(statusChanged  && { freshserviceStatus:   event.fsStatus }),
          ...(priorityChanged && { freshservicePriority: event.fsPriority, jiraPriority: newPriorityName }),
          ...(subjectChanged  && { summary: event.subject }),
        },
      );

      await this.logSync({
        eventType: 'ticket_updated', source: 'freshservice', destination: 'jira',
        jiraIssueId: mapping.jiraIssueId, jiraIssueKey,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: { ...updateData, transition: transitionTarget },
      });

      this.logger.log(`✅ [processUpdate] FS #${event.ticketId} → Jira ${jiraIssueKey} UPDATED`);

      // ── CONVERSATION FALLBACK CHECK ────────────────────────────────
      // If the webhook didn't send a note but an email/reply WAS the reason for this update event
      try {
        const conversations = await this.freshserviceService.getConversations(event.ticketId);
        if (conversations.length > 0) {
          // Newest conversations are usually at the end, but let's be safe and sort
          conversations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const latestConv = conversations[0];
          
          let body = latestConv.body_text || latestConv.body || '';
          
          // Strip HTML manually for hash consistency if needed
          body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (body !== '') {
            const hash = createHash('sha256').update(body).digest('hex');
            
            // Re-fetch mapping properly to ensure we have the absolute latest state
            const currentMapping = await this.ticketMappingModel.findOne({ jiraIssueId: mapping.jiraIssueId });
            
            if (currentMapping && currentMapping.lastNoteHash !== hash) {
              this.logger.log(`💬 [processUpdate] New conversation discovered via fallback fetch! (hash: ${hash})`);
              const agentName = latestConv.from_email || 'Freshservice User';
              
              // We trigger the native note processor safely
              await this.processNote({ type: 'note', ticketId: event.ticketId, body, agentName, hash }, currentMapping);
            }
          }
        }
      } catch (convErr) {
        this.logger.warn(`⚠️  [processUpdate] Failed to run conversation fallback check: ${convErr?.message}`);
      }

      return { status: 'success', message: `Jira ${jiraIssueKey} updated` };

    } catch (err) {
      await this.logSync({
        eventType: 'ticket_updated', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: event.ticketId, jiraIssueKey, status: 'failed',
        errorMessage: err?.message, payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─── processNote ──────────────────────────────────────────────
  private async processNote(
    event: { type: 'note'; ticketId: number; body: string; agentName: string; hash: string },
    mapping: TicketMappingDocument,
  ): Promise<{ status: string; message: string }> {
    // ── Duplicate note prevention ─────────────────────────────────
    if (mapping.lastNoteHash === event.hash) {
      this.logger.warn(
        `🔁 [processNote] Duplicate note detected for FS #${event.ticketId} ` +
        `(hash: ${event.hash.slice(0, 8)}...) — skipping`,
      );
      return { status: 'skipped', message: 'Duplicate note — already synced' };
    }

    // ── Loop prevention ───────────────────────────────────────────
    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(
        `🔄 [processNote] Loop prevention for FS #${event.ticketId} — resetting source`,
      );
      await this.ticketMappingModel.updateOne(
        { freshserviceTicketId: event.ticketId },
        { lastUpdatedSource: 'freshservice' },
      );
      return { status: 'skipped', message: 'Note loop prevention' };
    }

    this.logger.log(
      `💬 [processNote] "${event.agentName}" on FS #${event.ticketId} → Jira ${mapping.jiraIssueKey}`,
    );

    try {
      await this.jiraService.addComment(
        mapping.jiraIssueKey,
        event.body,
        event.agentName,
      );

      // Store hash to prevent reprocessing + mark source
      await this.ticketMappingModel.updateOne(
        { freshserviceTicketId: event.ticketId },
        {
          lastUpdatedSource: 'freshservice',
          lastSyncedAt:      new Date(),
          lastNoteHash:      event.hash,
        },
      );

      await this.logSync({
        eventType: 'note_synced', source: 'freshservice', destination: 'jira',
        jiraIssueId: mapping.jiraIssueId, jiraIssueKey: mapping.jiraIssueKey,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: { body: event.body.substring(0, 200), agentName: event.agentName },
      });

      this.logger.log(`✅ [processNote] Note synced → Jira ${mapping.jiraIssueKey}`);
      return { status: 'success', message: 'Comment added to Jira' };

    } catch (err) {
      await this.logSync({
        eventType: 'note_synced', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: event.ticketId, jiraIssueKey: mapping.jiraIssueKey,
        status: 'failed', errorMessage: err?.message,
      });
      throw err;
    }
  }

  // ─── processAttachment ────────────────────────────────────────
  private async processAttachment(
    event: { type: 'attachment'; ticketId: number; attachments: Array<{ name: string; attachment_url: string }> },
    mapping: TicketMappingDocument,
  ): Promise<{ status: string; message: string }> {
    if (event.attachments.length === 0) {
      this.logger.warn(`⚠️  [processAttachment] No valid attachments in payload for FS #${event.ticketId}`);
      return { status: 'skipped', message: 'No attachments in payload' };
    }

    this.logger.log(
      `📎 [processAttachment] FS #${event.ticketId} → Jira ${mapping.jiraIssueKey} | ` +
      `${event.attachments.length} file(s): [${event.attachments.map((a) => a.name).join(', ')}]`,
    );

    try {
      const result = await this.jiraService.uploadAttachments(
        mapping.jiraIssueKey,
        event.attachments,
      );

      await this.logSync({
        eventType: 'attachment_added', source: 'freshservice', destination: 'jira',
        jiraIssueId: mapping.jiraIssueId, jiraIssueKey: mapping.jiraIssueKey,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: {
          files:    event.attachments.map((a) => a.name),
          uploaded: result.uploaded,
          fallback: result.fallback,
        },
      });

      this.logger.log(
        `✅ [processAttachment] Done — ${result.uploaded} uploaded, ${result.fallback} fallback`,
      );
      return {
        status: 'success',
        message: `${result.uploaded} uploaded to Jira, ${result.fallback} via link comment`,
      };

    } catch (err) {
      await this.logSync({
        eventType: 'attachment_added', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: event.ticketId, jiraIssueKey: mapping.jiraIssueKey,
        status: 'failed', errorMessage: err?.message,
      });
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Shared Utilities
  // ─────────────────────────────────────────────────────────────

  /**
   * extractJiraDescription()
   * Handles both plain string descriptions and Jira's
   * Atlassian Document Format (ADF) object recursively.
   */
  private extractJiraDescription(rawDesc: any): string {
    if (!rawDesc) return 'No description provided.';
    if (typeof rawDesc === 'string') return rawDesc;

    const extract = (node: any): string => {
      if (!node) return '';
      if (node.type === 'text') return node.text ?? '';
      if (node.type === 'hardBreak') return '\n';
      if (Array.isArray(node.content)) {
        return node.content.map(extract).join('');
      }
      return '';
    };

    const text = extract(rawDesc).trim();
    return text || 'No description provided.';
  }

  /**
   * logSync()
   * Write an audit log entry to MongoDB.
   */
  private async logSync(data: {
    eventType: string;
    source: string;
    destination: string;
    jiraIssueId?: string;
    jiraIssueKey?: string;
    freshserviceTicketId?: number;
    status: string;
    errorMessage?: string;
    payloadSnapshot?: Record<string, any>;
    sentPayload?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.syncLogModel.create({ ...data });
    } catch (err) {
      this.logger.error(`⚠️  Failed to write sync log: ${err?.message}`);
    }
  }
}
