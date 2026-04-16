import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Stub — full schema definition coming in Step 3
export type TicketMappingDocument = HydratedDocument<TicketMapping>;

@Schema()
export class TicketMapping {
  @Prop() jiraIssueId: string;
  @Prop() freshserviceTicketId: number;
  @Prop() lastSyncedAt: Date;
  @Prop() lastUpdatedSource: string;
}

export const TicketMappingSchema = SchemaFactory.createForClass(TicketMapping);
