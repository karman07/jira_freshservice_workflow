import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { SyncModule } from '../sync/sync.module';
import { AdminModule } from '../admin/admin.module';
import { DatabaseModule } from '../database/database.module';
import { CustomerConfigService } from '../admin/customer-config.service';

/**
 * WebhookModule
 * ─────────────
 * Exposes per-customer and legacy webhook endpoints.
 * Delegates sync logic to SyncService (via SyncModule).
 * Uses CustomerConfigService to resolve per-tenant credentials.
 */
@Module({
  imports: [SyncModule, AdminModule, DatabaseModule],
  controllers: [WebhookController],
  providers: [CustomerConfigService],
})
export class WebhookModule {}
