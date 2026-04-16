import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JiraService } from './jira.service';

/**
 * JiraModule
 * ──────────
 * Responsibility:
 *   - Encapsulate ALL outbound communication with the Jira REST API
 *   - Provide JiraService to other modules (specifically SyncModule)
 *   - Uses HttpModule (Axios under the hood) for HTTP calls
 *   - Reads credentials from ConfigService (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
 *
 * Exposes:
 *   - createIssue()   → Called when a Freshservice ticket is created
 *   - updateIssue()   → Called when a Freshservice ticket is updated
 *   - addComment()    → Called when a Freshservice note is added
 */
@Module({
  imports: [
    HttpModule, // Provides HttpService (Axios wrapper) for API calls
  ],
  providers: [JiraService],
  exports: [JiraService], // Export so SyncModule can inject it
})
export class JiraModule {}
