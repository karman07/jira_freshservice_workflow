import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { SyncModule } from '../sync/sync.module';

/**
 * WebhookModule
 * ─────────────
 * Exposes:
 *   POST /api/webhook/jira           ← Jira automation webhook
 *   POST /api/webhook/freshservice   ← Freshservice automation webhook
 *
 * All business logic is delegated to SyncService (via SyncModule).
 * WebhookController is purely a routing + logging layer.
 */
@Module({
  imports: [SyncModule], // SyncModule exports SyncService
  controllers: [WebhookController],
})
export class WebhookModule {}
