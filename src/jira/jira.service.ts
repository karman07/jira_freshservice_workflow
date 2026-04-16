import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

/**
 * JiraService (Stub)
 * ──────────────────
 * This is a stub file created during Step 2 (project structure).
 * Full implementation will be added in Step 5.
 *
 * Will provide:
 *   - createIssue(data)   → POST to Jira REST API
 *   - updateIssue(id, data) → PUT to Jira REST API
 *   - addComment(issueId, body) → POST to Jira issue comments
 */
@Injectable()
export class JiraService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Full implementations coming in Step 5
}
