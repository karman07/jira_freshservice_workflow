import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FreshserviceService } from './freshservice.service';

/**
 * FreshserviceModule
 * ──────────────────
 * Responsibility:
 *   - Encapsulate ALL outbound communication with the Freshservice REST API
 *   - Provide FreshserviceService to other modules (specifically SyncModule)
 *   - Uses HttpModule (Axios under the hood) for HTTP calls
 *   - Reads credentials from ConfigService (FRESHSERVICE_BASE_URL, FRESHSERVICE_API_KEY)
 *
 * Exposes:
 *   - createTicket()  → Called when a Jira issue is created
 *   - updateTicket()  → Called when a Jira issue is updated
 *   - addNote()       → Called when a Jira comment is added
 */
@Module({
  imports: [
    HttpModule, // Provides HttpService (Axios wrapper) for API calls
  ],
  providers: [FreshserviceService],
  exports: [FreshserviceService], // Export so SyncModule can inject it
})
export class FreshserviceModule {}
