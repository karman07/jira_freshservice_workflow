import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TicketMapping,
  TicketMappingSchema,
} from './schemas/ticket-mapping.schema';
import { SyncLog, SyncLogSchema } from './schemas/sync-log.schema';

/**
 * DatabaseModule
 * ──────────────
 * Responsibility:
 *   - Register all Mongoose schemas (TicketMapping, SyncLog)
 *   - Export the models so other modules (SyncModule, etc.) can inject them
 *
 * This keeps database concerns isolated from business logic.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TicketMapping.name, schema: TicketMappingSchema },
      { name: SyncLog.name, schema: SyncLogSchema },
    ]),
  ],
  exports: [MongooseModule], // Export so SyncModule can use InjectModel()
})
export class DatabaseModule {}
