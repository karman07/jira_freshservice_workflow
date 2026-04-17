import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { FreshserviceService } from '../freshservice/freshservice.service';

/**
 * WebhookController
 * ─────────────────
 * POST /api/webhook/jira           ← receives events from Jira
 * POST /api/webhook/freshservice   ← receives events from Freshservice
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly freshserviceService: FreshserviceService,
  ) {}

  @Post('jira')
  @HttpCode(HttpStatus.OK)
  async handleJiraWebhook(@Body() payload: any) {
    this.logger.log('✅ [JIRA EVENT] Webhook received — sync processing...');

    const issue = payload?.issue?.fields;
    
    // 1. Extract Description (Handle Jira ADF if it's an object)
    let description = 'No Description';
    if (issue?.description) {
      if (typeof issue.description === 'string') {
        description = issue.description;
      } else if (typeof issue.description === 'object') {
        // Simple extraction for Jira ADF (Atlassian Document Format)
        // DFS to find all 'text' nodes
        const extractText = (obj: any): string => {
          if (!obj) return '';
          if (obj.text) return obj.text;
          if (Array.isArray(obj.content)) {
            return obj.content.map(extractText).join(' ');
          }
          if (obj.content) return extractText(obj.content);
          return '';
        };
        description = extractText(issue.description) || 'No Description';
      }
    }

    // 2. Map priority: Jira name → Freshservice priority code (1:Low, 2:Medium, 3:High, 4:Urgent)
    const priorityMap: Record<string, number> = {
      Lowest: 1,
      Low: 1,
      Medium: 2,
      High: 3,
      Highest: 4,
    };

    // 3. Map status: Jira name → Freshservice status code (2:Open, 3:Pending, 4:Resolved, 5:Closed)
    const statusMap: Record<string, number> = {
      'To Do': 2,
      'In Progress': 3,
      Done: 4,
    };

    const ticketData = {
      subject: issue?.summary || 'No Subject',
      description: description,
      priority: priorityMap[issue?.priority?.name] ?? 2,
      status: statusMap[issue?.status?.name] ?? 2,
      email: 'karmansingharora01@gmail.com', // Fallback or use jira user email
      // Required custom field in this Freshservice instance
      custom_fields: {
        status_awaiting_customer_response: 'Confirm Resolution',
      },
    };

    try {
      await this.freshserviceService.createTicket(ticketData);
      this.logger.log('✅ Freshservice ticket created successfully');
    } catch (err) {
      this.logger.error(`❌ Sync failed: ${err.message}`);
      // Return 200/OK to Jira so it doesn't retry infinitely on sync logic errors
    }

    return { received: true };
  }

  @Post('freshservice')
  @HttpCode(HttpStatus.OK)
  handleFreshserviceWebhook(@Body() payload: any) {
    console.log('✅ [FRESHSERVICE EVENT] Webhook received');
    return { received: true };
  }
}
