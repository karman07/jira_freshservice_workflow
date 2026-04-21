import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TicketMapping,
  TicketMappingSchema,
} from './schemas/ticket-mapping.schema';
import { SyncLog, SyncLogSchema } from './schemas/sync-log.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { Admin, AdminSchema } from './schemas/admin.schema';
import {
  FsPairMapping,
  FsPairMappingSchema,
} from './schemas/fs-pair-mapping.schema';

/**
 * DatabaseModule
 * ──────────────
 * Responsibility:
 *   - Register all Mongoose schemas
 *   - Export the models so other modules can inject them
 *
 * This keeps database concerns isolated from business logic.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TicketMapping.name, schema: TicketMappingSchema },
      { name: SyncLog.name, schema: SyncLogSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Admin.name, schema: AdminSchema },
      { name: FsPairMapping.name, schema: FsPairMappingSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
