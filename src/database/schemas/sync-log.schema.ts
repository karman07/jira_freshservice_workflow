import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Stub — full schema definition coming in Step 3
export type SyncLogDocument = HydratedDocument<SyncLog>;

@Schema()
export class SyncLog {
  @Prop() eventType: string;
  @Prop() source: string;
  @Prop() payload: string;
  @Prop() status: string;
  @Prop() errorMessage: string;
  @Prop() timestamp: Date;
}

export const SyncLogSchema = SchemaFactory.createForClass(SyncLog);
