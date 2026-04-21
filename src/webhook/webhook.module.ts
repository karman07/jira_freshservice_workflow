import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { SyncModule } from '../sync/sync.module';
import { AdminModule } from '../admin/admin.module';
import { DatabaseModule } from '../database/database.module';
import { CustomerConfigService } from '../admin/customer-config.service';
import { FreshserviceModule } from '../freshservice/freshservice.module';

/**
 * WebhookModule
 * ─────────────
 * Exposes per-customer and legacy webhook endpoints.
 * Delegates sync logic to SyncService (via SyncModule).
 * Uses CustomerConfigService to resolve per-tenant credentials.
 * Now also exposes the FS↔FS pair endpoint via FsPairSyncService.
 */
@Module({
  imports: [SyncModule, AdminModule, DatabaseModule, FreshserviceModule],
  controllers: [WebhookController],
  providers: [CustomerConfigService],
})
export class WebhookModule {}

