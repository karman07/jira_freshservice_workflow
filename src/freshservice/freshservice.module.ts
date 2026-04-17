import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FreshserviceService } from './freshservice.service';
import { FreshserviceClassifierService } from './freshservice-classifier.service';

/**
 * FreshserviceModule
 * ──────────────────
 * Encapsulates ALL outbound Freshservice REST API calls
 * and the incoming webhook classification logic.
 *
 * Provides & Exports:
 *   FreshserviceService           → HTTP calls to Freshservice API
 *   FreshserviceClassifierService → Smart event classification + note hashing
 */
@Module({
  imports: [HttpModule],
  providers: [FreshserviceService, FreshserviceClassifierService],
  exports: [FreshserviceService, FreshserviceClassifierService],
})
export class FreshserviceModule {}
