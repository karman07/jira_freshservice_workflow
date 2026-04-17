import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SyncLogDocument = HydratedDocument<SyncLog>;

/**
 * SyncLog
 * ───────
 * Every sync event (create, update, comment, status change, attachment)
 * is persisted here for auditing, debugging, and retry logic.
 */
@Schema({ timestamps: true })
export class SyncLog {
  // "issue_created" | "issue_updated" | "comment_created" | "status_changed"
  // "priority_changed" | "attachment_added" | "ticket_created" | "ticket_updated"
  @Prop({ required: true }) eventType: string;

  // "jira" | "freshservice"
  @Prop({ required: true }) source: string;

  // "freshservice" | "jira" — where we pushed the data
  @Prop({ required: true }) destination: string;

  // References for tracing
  @Prop() jiraIssueId: string;
  @Prop() jiraIssueKey: string;
  @Prop() freshserviceTicketId: number;

  // "success" | "failed" | "skipped" (loop prevention)
  @Prop({ required: true, default: 'success' }) status: string;

  // Human readable error (populated on failure)
  @Prop() errorMessage: string;

  // Full incoming payload snapshot (trimmed to 10KB max)
  @Prop({ type: Object }) payloadSnapshot: Record<string, any>;

  // The transformed data we actually sent to the destination
  @Prop({ type: Object }) sentPayload: Record<string, any>;
}

export const SyncLogSchema = SchemaFactory.createForClass(SyncLog);
