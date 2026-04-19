import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from './database/database.module';
import { WebhookModule } from './webhook/webhook.module';
import { JiraModule } from './jira/jira.module';
import { FreshserviceModule } from './freshservice/freshservice.module';
import { SyncModule } from './sync/sync.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // ── Load .env globally across the entire app ──────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Connect to MongoDB ────────────────────────────────────────
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),

    // ── Feature Modules ────────────────────────────────────────────
    DatabaseModule,          // Schemas: TicketMapping, SyncLog, Customer, Admin
    WebhookModule,           // POST /api/webhook/jira/:slug & /freshservice/:slug
    JiraModule,              // Outbound Jira REST API calls
    FreshserviceModule,      // Outbound Freshservice REST API calls
    SyncModule,              // Core multi-tenant sync orchestration
    AdminModule,             // Admin auth + customer CRUD + analytics
  ],
})
export class AppModule {}
