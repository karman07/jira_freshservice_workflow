import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JiraModule } from '../jira/jira.module';
import { FreshserviceModule } from '../freshservice/freshservice.module';
import { DatabaseModule } from '../database/database.module';

/**
 * SyncModule
 * ──────────
 * Core orchestration module for the bi-directional integration.
 *
 * Imports:
 *   JiraModule          → Provides JiraService (outbound Jira API)
 *   FreshserviceModule  → Provides FreshserviceService (outbound FS API)
 *   DatabaseModule      → Provides TicketMapping & SyncLog Mongoose models
 *
 * The DatabaseModule exports MongooseModule (with forFeature schemas),
 * so SyncService can use @InjectModel(TicketMapping.name) etc.
 *
 * Exports SyncService so WebhookModule's WebhookController can inject it.
 */
@Module({
  imports: [
    JiraModule,          // → JiraService
    FreshserviceModule,  // → FreshserviceService
    DatabaseModule,      // → TicketMappingModel, SyncLogModel
  ],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
