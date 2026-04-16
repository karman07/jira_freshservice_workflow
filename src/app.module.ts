import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from './database/database.module';
import { WebhookModule } from './webhook/webhook.module';
import { JiraModule } from './jira/jira.module';
import { FreshserviceModule } from './freshservice/freshservice.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    // ── Load .env globally across the entire app ──────────────────
    ConfigModule.forRoot({
      isGlobal: true,        // No need to re-import ConfigModule in child modules
      envFilePath: '.env',
    }),

    // ── Connect to MongoDB using MONGODB_URI from .env ────────────
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),

    // ── Feature Modules ────────────────────────────────────────────
    DatabaseModule,          // Mongoose schemas (TicketMapping, SyncLog)
    WebhookModule,           // POST /webhook/jira & POST /webhook/freshservice
    JiraModule,              // Outbound Jira REST API calls
    FreshserviceModule,      // Outbound Freshservice REST API calls
    SyncModule,              // Core sync orchestration logic
  ],
})
export class AppModule {}
