import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FreshserviceService } from './freshservice.service';
import { FreshserviceClassifierService } from './freshservice-classifier.service';
import { FsPairSyncService } from './fs-pair-sync.service';
import { DatabaseModule } from '../database/database.module';

/**
 * FreshserviceModule
 * ──────────────────
 * Encapsulates ALL outbound Freshservice REST API calls
 * and the incoming webhook classification logic.
 *
 * Provides & Exports:
 *   FreshserviceService           → HTTP calls to Freshservice API
 *   FreshserviceClassifierService → Smart event classification + note hashing
 *   FsPairSyncService             → Bi-directional FS↔FS ticket mirroring
 */
@Module({
  imports: [HttpModule, DatabaseModule],
  providers: [FreshserviceService, FreshserviceClassifierService, FsPairSyncService],
  exports: [FreshserviceService, FreshserviceClassifierService, FsPairSyncService],
})
export class FreshserviceModule {}
