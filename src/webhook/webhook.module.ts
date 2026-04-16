import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { SyncModule } from '../sync/sync.module';

/**
 * WebhookModule
 * ─────────────
 * Responsibility:
 *   - Expose HTTP endpoints for incoming webhook events:
 *       POST /api/webhook/jira           ← receives events from Jira
 *       POST /api/webhook/freshservice   ← receives events from Freshservice
 *   - Parse and validate incoming payloads using DTOs
 *   - Delegate processing to SyncService (via SyncModule)
 *   - Does NOT contain any business logic — purely a routing layer
 */
@Module({
  imports: [SyncModule], // Need SyncService to handle events
  controllers: [WebhookController],
})
export class WebhookModule {}
