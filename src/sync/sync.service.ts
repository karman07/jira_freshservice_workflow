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
import { CustomerConfig } from '../admin/customer-config.service';
import { createHash } from 'crypto';

/**
 * SyncService
 * ───────────
 * The orchestration brain of the entire integration.
 *
 * Now fully multi-tenant: every entry point accepts a CustomerConfig object
 * that carries the tenant's Jira + Freshservice credentials. All downstream
 * calls to JiraService and FreshserviceService are forwarded that config so
 * they hit the correct tenant API, not the global .env defaults.
 *
 * Responsibilities:
 *   1. Loop Prevention   — Checks `lastUpdatedSource` per tenant mapping.
 *   2. Ticket Mapping    — Scoped per customer via customerId field.
 *   3. Event Routing     — Routes each event type to the correct API call.
 *   4. Audit Logging     — Every sync attempt written to sync_logs collection.
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
   * Requires a CustomerConfig to know which tenant is sending the event.
   */
  async handleJiraEvent(
    webhookEvent: string,
    payload: any,
    customerConfig: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    this.logger.log(
      `\n${'─'.repeat(60)}\n🎯 [SYNC][${customerConfig.slug}] Jira Event: "${webhookEvent}"\n${'─'.repeat(60)}`,
    );

    const issue = payload?.issue;
    const jiraIssueKey: string = issue?.key;
    const jiraIssueId: string = issue?.id;
    const fields = issue?.fields ?? {};

    if (!jiraIssueKey || !jiraIssueId) {
      this.logger.warn('⚠️  [SYNC] Jira payload missing issue key/id — skipping.');
      return { status: 'skipped', message: 'Missing issue key/id' };
    }

    if (webhookEvent === 'jira:issue_created') {
      return this.handleJiraIssueCreated(jiraIssueKey, jiraIssueId, fields, payload, customerConfig);
    }

    if (webhookEvent === 'jira:issue_updated') {
      return this.handleJiraIssueUpdated(jiraIssueKey, jiraIssueId, fields, payload, customerConfig);
    }

    if (
      webhookEvent === 'comment_created' ||
      webhookEvent === 'comment_updated'
    ) {
      return this.handleJiraCommentCreated(jiraIssueKey, jiraIssueId, payload, customerConfig);
    }

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
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    // Idempotency guard — scoped per customer
    const existing = await this.ticketMappingModel.findOne({ customerId: cfg.customerId, jiraIssueId });
    if (existing) {
      this.logger.warn(
        `⚠️  [SYNC][${cfg.slug}] Mapping already exists for ${jiraIssueKey} → FS#${existing.freshserviceTicketId}`,
      );
      return { status: 'skipped', message: 'Mapping already exists' };
    }

    const summary = fields?.summary ?? 'No Subject';

    // Loop prevention: skip if created by FS sync
    if (/^\[FS-\d+\]/.test(summary)) {
      this.logger.warn(
        `🔄 [SYNC][${cfg.slug}] Loop prevention: ${jiraIssueKey} originated from Freshservice`,
      );
      return { status: 'skipped', message: 'Loop prevention: issue originated from Freshservice' };
    }

    const issueTags: string[] = fields?.labels ?? [];
    if (issueTags.includes('freshservice-sync') || issueTags.includes('jira-sync')) {
      this.logger.warn(`🔄 [SYNC][${cfg.slug}] Loop prevention: sync label detected on ${jiraIssueKey}`);
      return { status: 'skipped', message: 'Loop prevention: sync label detected' };
    }

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
      cfg.fallbackEmail ??
      this.configService.get<string>('FALLBACK_EMAIL') ??
      'support@example.com';

    this.logger.log(
      `📋 [SYNC][${cfg.slug}] Creating FS ticket for ${jiraIssueKey}: "${summary}" ` +
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
      }, cfg);

      await this.ticketMappingModel.create({
        customerId: cfg.customerId,
        jiraIssueKey,
        jiraIssueId,
        freshserviceTicketId: fsTicket.id,
        lastUpdatedSource: 'jira',
        summary,
        jiraStatus: statusName || 'Unknown',
        freshserviceStatus: status,
        jiraPriority: priorityName || 'Unknown',
        freshservicePriority: priority,
      });

      await this.logSync({
        customerId: cfg.customerId,
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
        `✅ [SYNC][${cfg.slug}] ${jiraIssueKey} → FS Ticket #${fsTicket.id} CREATED`,
      );
      return { status: 'success', message: `FS Ticket #${fsTicket.id} created for ${jiraIssueKey}` };
    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'issue_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        status: 'failed',
        errorMessage: err?.message,
        errorCode: (err?.response?.status ?? err?.code ?? '').toString() || undefined,
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
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ customerId: cfg.customerId, jiraIssueId });

    if (!mapping) {
      this.logger.warn(`⚠️  [SYNC][${cfg.slug}] No mapping for ${jiraIssueKey} — skipping`);
      return { status: 'skipped', message: 'No ticket mapping' };
    }

    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(`🔄 [SYNC][${cfg.slug}] Loop prevention: ${jiraIssueKey} was last updated by FS`);
      await this.ticketMappingModel.updateOne({ customerId: cfg.customerId, jiraIssueId }, { lastUpdatedSource: 'jira' });
      return { status: 'skipped', message: 'Loop prevention triggered' };
    }

    const fsTicketId = mapping.freshserviceTicketId;
    const changedFields = payload?.changelog?.items ?? [];

    this.logger.log(
      `📋 [SYNC][${cfg.slug}] Updating FS #${fsTicketId} for ${jiraIssueKey} — ` +
      `Changed fields: [${changedFields.map((c: any) => c.field).join(', ')}]`,
    );

    // Attachment changes come via issue_updated changelog
    const hasAttachmentChange = changedFields.some(
      (c: any) => c.field?.toLowerCase() === 'attachment',
    );
    if (hasAttachmentChange) {
      this.logger.log(`📎 [SYNC][${cfg.slug}] Attachment change detected — routing to attachment handler`);
      return this.handleJiraAttachmentAdded(jiraIssueKey, jiraIssueId, fields, payload, cfg);
    }

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
        const newPriority = Math.max(1, Math.min(4,
          Number(FreshserviceService.PRIORITY_MAP[change.toString ?? fields?.priority?.name]) || 2,
        ));
        updatePayload.priority = newPriority;
        this.logger.log(`   🎯 Priority: "${change.fromString}" → "${change.toString}" (FS: ${newPriority})`);
      }
      if (field === 'status') {
        const newStatus = Math.max(2, Math.min(5,
          Number(FreshserviceService.STATUS_MAP[change.toString ?? fields?.status?.name]) || 2,
        ));
        updatePayload.status = newStatus;
        this.logger.log(`   🎯 Status: "${change.fromString}" → "${change.toString}" (FS: ${newStatus})`);
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      this.logger.log(`ℹ️  [SYNC][${cfg.slug}] No relevant field changes for FS — skipping update`);
      return { status: 'skipped', message: 'No relevant field changes' };
    }

    try {
      await this.freshserviceService.updateTicket(fsTicketId, updatePayload, cfg);

      await this.ticketMappingModel.updateOne(
        { customerId: cfg.customerId, jiraIssueId },
        {
          lastUpdatedSource: 'jira',
          lastSyncedAt: new Date(),
          ...(updatePayload.status   && { freshserviceStatus:   updatePayload.status }),
          ...(updatePayload.priority && { freshservicePriority: updatePayload.priority }),
          ...(updatePayload.subject  && { summary:              updatePayload.subject }),
        },
      );

      await this.logSync({
        customerId: cfg.customerId,
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

      this.logger.log(`✅ [SYNC][${cfg.slug}] ${jiraIssueKey} → FS #${fsTicketId} UPDATED`);
      return { status: 'success', message: `FS #${fsTicketId} updated for ${jiraIssueKey}` };
    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
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
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ customerId: cfg.customerId, jiraIssueId });
    if (!mapping) {
      this.logger.warn(`⚠️  [SYNC][${cfg.slug}] No mapping for ${jiraIssueKey} on comment — skipping`);
      return { status: 'skipped', message: 'No ticket mapping found' };
    }

    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(`🔄 [SYNC][${cfg.slug}] Comment loop prevention for ${jiraIssueKey}`);
      await this.ticketMappingModel.updateOne({ customerId: cfg.customerId, jiraIssueId }, { lastUpdatedSource: 'jira' });
      return { status: 'skipped', message: 'Comment loop prevention' };
    }

    const comment = payload?.comment;
    const rawBody = comment?.body;
    const commentBody = this.extractJiraDescription(rawBody);
    const authorName = comment?.author?.displayName ?? 'Jira User';

    this.logger.log(
      `💬 [SYNC][${cfg.slug}] Comment from ${authorName} on ${jiraIssueKey} → FS #${mapping.freshserviceTicketId}`,
    );

    try {
      const fsNote = await this.freshserviceService.addNote(
        mapping.freshserviceTicketId,
        commentBody,
        { isPrivate: false, authorName },
        cfg,
      );

      const updatePayload: any = { lastUpdatedSource: 'jira', lastSyncedAt: new Date() };
      if (fsNote && fsNote.id) {
        updatePayload.lastNoteId = fsNote.id;
        this.logger.log(`📍 [SYNC][${cfg.slug}] Set lastNoteId to ${fsNote.id} to prevent loopback.`);
      }

      await this.ticketMappingModel.updateOne({ customerId: cfg.customerId, jiraIssueId }, updatePayload);

      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'comment_created',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'success',
        sentPayload: { body: commentBody.substring(0, 200) },
      });

      this.logger.log(`✅ [SYNC][${cfg.slug}] Comment synced: ${jiraIssueKey} → FS #${mapping.freshserviceTicketId}`);
      return { status: 'success', message: 'Comment note added to Freshservice' };
    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
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
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const mapping = await this.ticketMappingModel.findOne({ customerId: cfg.customerId, jiraIssueId });
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
        'Jira (via Sync)',
        cfg,
      );

      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'attachment_added',
        source: 'jira',
        destination: 'freshservice',
        jiraIssueId,
        jiraIssueKey,
        freshserviceTicketId: mapping.freshserviceTicketId,
        status: 'success',
        sentPayload: { attachmentCount: attachments.length, uploaded: result.uploaded, fallback: result.fallback },
      });

      return { status: 'success', message: `${result.uploaded} attachment(s) uploaded to FS, ${result.fallback} via link note` };
    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
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
  // ② FRESHSERVICE → JIRA
  // ─────────────────────────────────────────────────────────────

  /**
   * handleFreshserviceEvent()
   * SINGLE entry point for all Freshservice webhook payloads.
   * Requires a CustomerConfig to know which tenant is sending the event.
   */
  async handleFreshserviceEvent(
    rawPayload: any,
    customerConfig: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const separator = '═'.repeat(60);
    this.logger.log(`\n${separator}\n📥 [FS→JIRA][${customerConfig.slug}] Incoming Freshservice webhook\n${separator}`);

    const event = this.classifier.classify(rawPayload);

    if (event.type === 'unknown') {
      this.logger.warn(`⚠️  [FS→JIRA][${customerConfig.slug}] Skipped: ${event.reason}`);
      return { status: 'skipped', message: event.reason };
    }

    this.logger.log(
      `🎯 [FS→JIRA][${customerConfig.slug}] Classified as: "${event.type.toUpperCase()}" | Ticket #${event.ticketId}`,
    );

    let mapping =
      event.type !== 'create'
        ? await this.ticketMappingModel.findOne({
            customerId: customerConfig.customerId,
            freshserviceTicketId: event.ticketId,
          })
        : null;

    try {
      switch (event.type) {
        case 'create': {
          const createResult = await this.processCreate(event, rawPayload, customerConfig);
          if (createResult.status === 'success') {
            const mappingAfterCreate = await this.ticketMappingModel.findOne({
              customerId: customerConfig.customerId,
              freshserviceTicketId: event.ticketId,
            });
            if (mappingAfterCreate) {
              const conversations = await this.freshserviceService.getConversations(event.ticketId, customerConfig);
              await this.processNotes(conversations, mappingAfterCreate, customerConfig);
            }
          }
          return createResult;
        }

        case 'update':
          if (!mapping) {
            this.logger.warn(`⚠️  [FS→JIRA][${customerConfig.slug}] No mapping for FS#${event.ticketId} — attempting create`);
            return this.processCreate({
              type: 'create',
              ticketId: event.ticketId,
              subject: event.subject ?? 'No Subject',
              description: '',
              fsPriority: event.fsPriority ?? 2,
              fsStatus: event.fsStatus ?? 2,
            }, rawPayload, customerConfig);
          }
          return this.handleFreshserviceUpdate(event, mapping, rawPayload, customerConfig);

        case 'attachment':
          if (!mapping) {
            this.logger.warn(`⚠️  [FS→JIRA][${customerConfig.slug}] No mapping for FS#${event.ticketId} attachment — skipping`);
            return { status: 'skipped', message: 'No mapping for attachment' };
          }
          return this.processAttachment(event, mapping, customerConfig);

        default:
          return { status: 'skipped', message: 'Unhandled event type' };
      }
    } catch (err) {
      this.logger.error(`❌ [FS→JIRA][${customerConfig.slug}] Processor error: ${err?.message}`);
      throw err;
    }
  }

  // ─── processCreate ────────────────────────────────────────────
  private async processCreate(
    event: { type: 'create'; ticketId: number; subject: string; description: string; fsPriority: number; fsStatus: number },
    rawPayload: any,
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const existing = await this.ticketMappingModel.findOne({
      customerId: cfg.customerId,
      freshserviceTicketId: event.ticketId,
    });
    if (existing) {
      this.logger.warn(`⚠️  [processCreate][${cfg.slug}] Mapping already exists: FS#${event.ticketId} → ${existing.jiraIssueKey}`);
      return { status: 'skipped', message: 'Mapping already exists' };
    }

    const priorityName = JiraService.PRIORITY_MAP[event.fsPriority] ?? 'Medium';

    this.logger.log(
      `🚀 [processCreate][${cfg.slug}] FS #${event.ticketId} → Jira | ` +
      `"${event.subject}" | Priority: ${event.fsPriority}→${priorityName}`,
    );

    try {
      const jiraIssue = await this.jiraService.createIssue({
        summary:     event.subject,
        description: event.description,
        priority:    priorityName,
      }, cfg);

      await this.ticketMappingModel.create({
        customerId:            cfg.customerId,
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
        customerId: cfg.customerId,
        eventType: 'ticket_created', source: 'freshservice', destination: 'jira',
        jiraIssueId: jiraIssue.id, jiraIssueKey: jiraIssue.key,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: { summary: `[FS-${event.ticketId}] ${event.subject}`, priority: priorityName },
      });

      this.logger.log(`✅ [processCreate][${cfg.slug}] FS #${event.ticketId} → Jira ${jiraIssue.key} CREATED`);
      return { status: 'success', message: `Jira ${jiraIssue.key} created for FS #${event.ticketId}` };

    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'ticket_created', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: event.ticketId, status: 'failed', errorMessage: err?.message,
        errorCode: (err?.response?.status ?? err?.code ?? '').toString() || undefined,
        payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─── handleFreshserviceUpdate ─────────────────────────────────
  private async handleFreshserviceUpdate(
    event: { type: 'update'; ticketId: number; subject?: string; fsPriority?: number; fsStatus?: number; hasChanges: boolean },
    mapping: TicketMappingDocument,
    rawPayload: any,
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    const ticketId = event.ticketId;
    const jiraIssueKey = mapping.jiraIssueKey;

    this.logger.log(`🔄 [handleFreshserviceUpdate][${cfg.slug}] FS #${ticketId} → Jira ${jiraIssueKey}`);

    // STEP 1: ALWAYS fetch conversations first
    const conversations = await this.freshserviceService.getConversations(ticketId, cfg);
    this.logger.log(`🔍 [handleFreshserviceUpdate] Fetched ${conversations.length} conversations for FS #${ticketId}`);

    // STEP 2: ALWAYS process new notes first
    await this.processNotes(conversations, mapping, cfg);

    // STEP 3: Then check field changes (Metadata Sync)
    if (mapping.lastUpdatedSource === 'freshservice') {
      this.logger.warn(`🔄 [handleFreshserviceUpdate][${cfg.slug}] Metadata loop prevention triggered`);
      return { status: 'skipped', message: 'Metadata loop prevention triggered' };
    }

    if (!event.hasChanges) {
      this.logger.log(`ℹ️ [handleFreshserviceUpdate][${cfg.slug}] No field changes detected`);
      return { status: 'skipped', message: 'No field changes' };
    }

    const newPriorityName = event.fsPriority != null ? JiraService.PRIORITY_MAP[event.fsPriority] : undefined;
    const transitionTarget = event.fsStatus != null ? JiraService.STATUS_NAME_MAP[event.fsStatus] : undefined;

    const priorityChanged = newPriorityName && newPriorityName !== mapping.jiraPriority;
    const statusChanged = event.fsStatus && event.fsStatus !== mapping.freshserviceStatus;
    const subjectChanged = event.subject && event.subject !== mapping.summary;

    if (!priorityChanged && !statusChanged && !subjectChanged) {
      this.logger.log(`ℹ️ [handleFreshserviceUpdate][${cfg.slug}] Metadata unchanged vs cache`);
      return { status: 'skipped', message: 'Metadata unchanged' };
    }

    const updateData: any = {};
    if (subjectChanged)  updateData.summary = event.subject;
    if (priorityChanged) updateData.priority = newPriorityName;

    try {
      if (Object.keys(updateData).length > 0) {
        await this.jiraService.updateIssue(jiraIssueKey, updateData, cfg);
      }
      if (transitionTarget && statusChanged) {
        await this.jiraService.transitionIssue(jiraIssueKey, transitionTarget, cfg);
      }

      await this.ticketMappingModel.updateOne(
        { customerId: cfg.customerId, freshserviceTicketId: ticketId },
        {
          lastUpdatedSource: 'freshservice',
          lastSyncedAt:      new Date(),
          ...(statusChanged   && { freshserviceStatus:   event.fsStatus }),
          ...(priorityChanged && { freshservicePriority: event.fsPriority, jiraPriority: newPriorityName }),
          ...(subjectChanged  && { summary: event.subject }),
        },
      );

      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'ticket_updated', source: 'freshservice', destination: 'jira',
        jiraIssueId: mapping.jiraIssueId, jiraIssueKey,
        freshserviceTicketId: ticketId, status: 'success',
        sentPayload: { ...updateData, transition: transitionTarget },
      });

      return { status: 'success', message: `Jira ${jiraIssueKey} fields updated` };
    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'ticket_updated', source: 'freshservice', destination: 'jira',
        freshserviceTicketId: ticketId, jiraIssueKey, status: 'failed',
        errorMessage: err?.message, payloadSnapshot: rawPayload,
      });
      throw err;
    }
  }

  // ─── processNotes ─────────────────────────────────────────────
  private async processNotes(conversations: any[], mapping: TicketMappingDocument, cfg: CustomerConfig): Promise<void> {
    if (!conversations || conversations.length === 0) return;

    const ticketId = mapping.freshserviceTicketId;
    const jiraIssueKey = mapping.jiraIssueKey;

    const publicNotes = conversations.filter((conv) => conv.private === false);
    publicNotes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let latestProcessedId = mapping.lastNoteId || 0;
    let newNotesCount = 0;

    for (const note of publicNotes) {
      if (note.id > latestProcessedId) {
        let body = note.body_text || note.body || '';
        body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        if (!body) {
          latestProcessedId = note.id;
          continue;
        }

        // Filter out automated time-tracking updates (e.g. "hour0 min1 total Minutes 1.0 support Minutes so far...")
        const isTimeTracking = /support (minutes|hours) so far/i.test(body) || /Support (minutes|hours) remaining/i.test(body);
        if (isTimeTracking) {
          this.logger.log(`⏲️  [processNotes][${cfg.slug}] Skipping automated time-tracking note #${note.id}`);
          latestProcessedId = note.id;
          await this.ticketMappingModel.updateOne(
            { customerId: cfg.customerId, jiraIssueKey },
            { lastNoteId: latestProcessedId }
          );
          continue;
        }

        const hash = createHash('sha256').update(body).digest('hex');
        if (mapping.lastNoteHash === hash) {
          latestProcessedId = note.id;
          continue;
        }

        const agentName = note.from_email || note.user_id?.toString() || 'Freshservice User';
        this.logger.log(`💬 [processNotes][${cfg.slug}] New note #${note.id} detected → Jira ${jiraIssueKey}`);

        try {
          await this.jiraService.addComment(jiraIssueKey, body, agentName, cfg);

          latestProcessedId = note.id;
          await this.ticketMappingModel.updateOne(
            { customerId: cfg.customerId, jiraIssueKey },
            { lastNoteId: latestProcessedId, lastNoteHash: hash }
          );

          await this.logSync({
            customerId: cfg.customerId,
            eventType: 'note_synced', source: 'freshservice', destination: 'jira',
            jiraIssueId: mapping.jiraIssueId, jiraIssueKey,
            freshserviceTicketId: ticketId, status: 'success',
            sentPayload: { body: body.substring(0, 100), noteId: note.id },
          });

          newNotesCount++;
        } catch (err) {
          this.logger.error(`❌ [processNotes][${cfg.slug}] Failed to sync note #${note.id}: ${err?.message}`);
        }
      }
    }

    if (newNotesCount > 0) {
      this.logger.log(`✅ [processNotes][${cfg.slug}] Synced ${newNotesCount} new note(s) to Jira ${jiraIssueKey}`);
    } else {
      this.logger.log(`ℹ️ [processNotes][${cfg.slug}] No new notes for FS #${ticketId}`);
    }
  }

  // ─── processAttachment ────────────────────────────────────────
  private async processAttachment(
    event: { type: 'attachment'; ticketId: number; attachments: Array<{ name: string; attachment_url: string }> },
    mapping: TicketMappingDocument,
    cfg: CustomerConfig,
  ): Promise<{ status: string; message: string }> {
    if (event.attachments.length === 0) {
      this.logger.warn(`⚠️  [processAttachment][${cfg.slug}] No valid attachments for FS #${event.ticketId}`);
      return { status: 'skipped', message: 'No attachments in payload' };
    }

    this.logger.log(
      `📎 [processAttachment][${cfg.slug}] FS #${event.ticketId} → Jira ${mapping.jiraIssueKey} | ` +
      `${event.attachments.length} file(s)`,
    );

    try {
      const result = await this.jiraService.uploadAttachments(
        mapping.jiraIssueKey,
        event.attachments,
        'Freshservice (via Sync)',
        cfg,
      );

      await this.logSync({
        customerId: cfg.customerId,
        eventType: 'attachment_added', source: 'freshservice', destination: 'jira',
        jiraIssueId: mapping.jiraIssueId, jiraIssueKey: mapping.jiraIssueKey,
        freshserviceTicketId: event.ticketId, status: 'success',
        sentPayload: { files: event.attachments.map((a) => a.name), uploaded: result.uploaded, fallback: result.fallback },
      });

      return { status: 'success', message: `${result.uploaded} uploaded to Jira, ${result.fallback} via link comment` };

    } catch (err) {
      await this.logSync({
        customerId: cfg.customerId,
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
   * Handles both plain string descriptions and Jira's ADF objects recursively.
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
    customerId?: string;
    eventType: string;
    source: string;
    destination: string;
    jiraIssueId?: string;
    jiraIssueKey?: string;
    freshserviceTicketId?: number;
    status: string;
    errorMessage?: string;
    errorCode?: string;
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
