import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FsPairMappingDocument = HydratedDocument<FsPairMapping>;

/**
 * FsPairMapping
 * ─────────────
 * Persists the permanent link between a ticket in Freshservice Instance A
 * and its mirror ticket in Freshservice Instance B, for a given customer.
 *
 * Compound unique index ensures exactly one pair per customer per source ticket.
 */
@Schema({ timestamps: true, collection: 'fs_pair_mappings' })
export class FsPairMapping {
  /** Which customer (tenant) this pair belongs to */
  @Prop({ required: true, index: true }) customerId: string;

  /** Numeric ticket ID on the PRIMARY (Instance A) Freshservice */
  @Prop({ required: true, index: true }) instanceATicketId: number;

  /** Numeric ticket ID on the SECONDARY (Instance B) Freshservice */
  @Prop({ required: true, index: true }) instanceBTicketId: number;

  /**
   * Loop-prevention guard.
   * "instanceA" | "instanceB" — which FS last wrote to the pair,
   * so the echo webhook from the destination is ignored.
   */
  @Prop({ required: true, default: 'instanceA' }) lastUpdatedSource: string;

  /** ISO timestamp of the last successful mirror sync */
  @Prop({ default: () => new Date() }) lastSyncedAt: Date;

  /** Snapshot of the original subject */
  @Prop() subject: string;

  /** Cached status codes for change detection (avoid spurious updates) */
  @Prop() instanceAStatus: number;
  @Prop() instanceBStatus: number;

  /** Cached priority codes */
  @Prop() instanceAPriority: number;
  @Prop() instanceBPriority: number;

  /** SHA-256 hash of the last conversation note body — dedup guard */
  @Prop() lastNoteHash: string;

  /** Numeric ID of last conversation synced from A→B direction */
  @Prop() lastNoteIdAtoB: number;

  /** Numeric ID of last conversation synced from B→A direction */
  @Prop() lastNoteIdBtoA: number;
}

export const FsPairMappingSchema = SchemaFactory.createForClass(FsPairMapping);

// One source ticket → exactly one mirror per customer
FsPairMappingSchema.index(
  { customerId: 1, instanceATicketId: 1 },
  { unique: true },
);
FsPairMappingSchema.index(
  { customerId: 1, instanceBTicketId: 1 },
  { unique: true },
);
