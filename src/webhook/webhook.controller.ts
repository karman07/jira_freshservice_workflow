import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';

/**
 * WebhookController (Stub)
 * ────────────────────────
 * This is a stub file created during Step 2 (project structure).
 * Full implementation with DTOs and validation will be added in Step 4.
 *
 * Endpoints:
 *   POST /api/webhook/jira           ← receives Jira webhook events
 *   POST /api/webhook/freshservice   ← receives Freshservice webhook events
 */
@Controller('webhook')
export class WebhookController {
  constructor(private readonly syncService: SyncService) {}

  @Post('jira')
  @HttpCode(HttpStatus.OK)
  handleJiraWebhook(@Body() payload: any) {
    console.log('--- [JIRA WEBHOOK RECEIVED] ---');
    console.log(JSON.stringify(payload, null, 2));
    // Full implementation in Step 4
    return { received: true };
  }

  @Post('freshservice')
  @HttpCode(HttpStatus.OK)
  handleFreshserviceWebhook(@Body() payload: any) {
    console.log('--- [FRESHSERVICE WEBHOOK RECEIVED] ---');
    console.log(JSON.stringify(payload, null, 2));
    // Full implementation in Step 4
    return { received: true };
  }
}
