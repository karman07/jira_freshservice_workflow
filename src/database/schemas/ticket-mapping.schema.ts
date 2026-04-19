import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TicketMappingDocument = HydratedDocument<TicketMapping>;

/**
 * TicketMapping
 * ─────────────
 * Stores the permanent link between a Jira issue and a Freshservice ticket.
 * Now scoped per customer (tenant) via customerId.
 */
@Schema({ timestamps: true })
export class TicketMapping {
  // Which customer (tenant) this mapping belongs to
  @Prop({ required: true, index: true }) customerId: string;

  // Jira issue key e.g. "SCRUM-42"
  @Prop({ required: true, index: true }) jiraIssueKey: string;

  // Jira internal issue id e.g. "10042"
  @Prop({ required: true, index: true }) jiraIssueId: string;

  // Freshservice ticket numeric id e.g. 123
  @Prop({ required: true, index: true }) freshserviceTicketId: number;

  // "jira" | "freshservice" — which system triggered the last sync (loop guard)
  @Prop({ required: true, default: 'jira' }) lastUpdatedSource: string;

  // ISO timestamp of last successful sync
  @Prop({ default: () => new Date() }) lastSyncedAt: Date;

  // Summary snapshot for quick lookups
  @Prop() summary: string;

  // Cached priority / status (to avoid redundant API calls)
  @Prop() jiraStatus: string;
  @Prop() freshserviceStatus: number;
  @Prop() jiraPriority: string;
  @Prop() freshservicePriority: number;

  // SHA-256 hash of the last synced note body — prevents duplicate note syncs
  @Prop() lastNoteHash: string;

  // The numeric ID of the last conversation (note/reply) synced from Freshservice
  @Prop() lastNoteId: number;
}

export const TicketMappingSchema = SchemaFactory.createForClass(TicketMapping);

// Compound unique index — each Jira issue maps to exactly one FS ticket PER customer
TicketMappingSchema.index(
  { customerId: 1, jiraIssueId: 1, freshserviceTicketId: 1 },
  { unique: true },
);

