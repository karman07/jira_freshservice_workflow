import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JiraModule } from '../jira/jira.module';
import { FreshserviceModule } from '../freshservice/freshservice.module';
import { DatabaseModule } from '../database/database.module';

/**
 * SyncModule
 * ──────────
 * Responsibility:
 *   - CORE orchestration logic of the entire integration
 *   - Imports JiraModule and FreshserviceModule to call their services
 *   - Imports DatabaseModule to access TicketMapping and SyncLog collections
 *   - Contains SyncService which:
 *       → Looks up existing mappings in MongoDB
 *       → Decides CREATE vs UPDATE
 *       → Prevents infinite sync loops (lastUpdatedSource check)
 *       → Transforms fields between Jira and Freshservice formats
 *       → Logs all sync events to sync_logs collection
 *
 * Exports SyncService so WebhookModule can inject it into WebhookController.
 */
@Module({
  imports: [
    JiraModule,           // Provides JiraService
    FreshserviceModule,   // Provides FreshserviceService
    DatabaseModule,       // Provides TicketMapping & SyncLog models
  ],
  providers: [SyncService],
  exports: [SyncService], // Export so WebhookModule can use it
})
export class SyncModule {}
