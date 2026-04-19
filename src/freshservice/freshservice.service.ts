import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { CustomerConfig } from '../admin/customer-config.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');

/**
 * FreshserviceService
 * ───────────────────
 * Handles ALL outbound REST API calls to Freshservice.
 *
 * Now fully multi-tenant: every public method accepts an optional
 * CustomerConfig object. When provided, it uses customer-specific
 * credentials; otherwise falls back to global .env values.
 *
 * Freshservice status codes:
 *   2 = Open  |  3 = Pending  |  4 = Resolved  |  5 = Closed
 *
 * Freshservice priority codes:
 *   1 = Low  |  2 = Medium  |  3 = High  |  4 = Urgent
 */
@Injectable()
export class FreshserviceService {
  private readonly logger = new Logger(FreshserviceService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Private Helpers — tenant-aware
  // ─────────────────────────────────────────────────────────────

  private getBaseUrl(cfg?: CustomerConfig): string {
    return cfg?.freshserviceBaseUrl ||
      this.configService.get<string>('FRESHSERVICE_BASE_URL') as string;
  }

  private getHeaders(cfg?: CustomerConfig) {
    const apiKey = cfg?.freshserviceApiKey ||
      this.configService.get<string>('FRESHSERVICE_API_KEY');
    const encoded = Buffer.from(`${apiKey}:X`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T = any>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    data?: any,
    cfg?: CustomerConfig,
  ): Promise<T> {
    const baseUrl = this.getBaseUrl(cfg);
    const url = `${baseUrl}${path}`;
    this.logger.log(`📡 [FS] ${method.toUpperCase()} → ${url}`);
    if (data) {
      this.logger.debug(`📦 Payload: ${JSON.stringify(data, null, 2)}`);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          method,
          url,
          data,
          headers: this.getHeaders(cfg),
        }),
      );
      return response.data;
    } catch (error) {
      const status = error?.response?.status ?? 'UNKNOWN';
      const msg =
        error?.response?.data?.description ||
        error?.response?.data?.message ||
        error?.message;
      const errors = error?.response?.data?.errors;

      this.logger.error(`❌ [FS] ${method.toUpperCase()} ${path} → [${status}] ${msg}`);
      if (errors) {
        this.logger.error(`📝 Validation errors: ${JSON.stringify(errors, null, 2)}`);
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Status & Priority Maps (Jira → Freshservice)
  // ─────────────────────────────────────────────────────────────

  static readonly PRIORITY_MAP: Record<string, number> = {
    Lowest: 1,
    Low: 1,
    Medium: 2,
    High: 3,
    Highest: 4,
    Critical: 4,
  };

  static readonly STATUS_MAP: Record<string, number> = {
    'To Do': 2,          // Open
    'In Progress': 3,    // Pending
    'In Review': 3,      // Pending
    Done: 4,             // Resolved
    Closed: 5,           // Closed
  };

  // Reverse map: Freshservice status code → readable name
  static readonly FS_STATUS_NAMES: Record<number, string> = {
    2: 'Open',
    3: 'Pending',
    4: 'Resolved',
    5: 'Closed',
  };

  static readonly FS_PRIORITY_NAMES: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Urgent',
  };

  // ─────────────────────────────────────────────────────────────
  // Public API Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * createTicket()
   * Fired when a Jira issue is CREATED.
   */
  async createTicket(
    data: {
      subject: string;
      description: string;
      priority: number;
      status: number;
      email: string;
      tags?: string[];
      sourceLabel?: string;
    },
    cfg?: CustomerConfig,
  ): Promise<any> {
    this.logger.log(`\n🚀 [FS] createTicket → "${data.subject}"`);

    const payload: any = {
      subject: data.subject,
      description: data.description || 'No description provided.',
      priority: data.priority ?? 2,
      status: data.status ?? 2,
      email: data.email,
      source: 2, // Portal
      tags: data.tags ?? ['jira-sync'],
    };

    // Use customer-specific custom field or fall back to env
    const customStatusAwaiting =
      cfg?.fsCustomStatusAwaiting ||
      this.configService.get<string>('FS_CUSTOM_STATUS_AWAITING');

    if (customStatusAwaiting) {
      payload.custom_fields = {
        status_awaiting_customer_response: customStatusAwaiting,
      };
    }

    const result = await this.request('post', '/api/v2/tickets', payload, cfg);
    const ticket = result?.ticket;

    this.logger.log(
      `✅ [FS] Ticket created: #${ticket?.id} — "${ticket?.subject}" ` +
      `[Status: ${FreshserviceService.FS_STATUS_NAMES[ticket?.status] ?? ticket?.status}] ` +
      `[Priority: ${FreshserviceService.FS_PRIORITY_NAMES[ticket?.priority] ?? ticket?.priority}]`,
    );

    return ticket;
  }

  /**
   * updateTicket()
   * Fired when a Jira issue is UPDATED.
   */
  async updateTicket(
    ticketId: number,
    data: {
      subject?: string;
      description?: string;
      priority?: number;
      status?: number;
    },
    cfg?: CustomerConfig,
  ): Promise<any> {
    this.logger.log(`\n🔄 [FS] updateTicket #${ticketId} → ${JSON.stringify(data)}`);

    const result = await this.request('put', `/api/v2/tickets/${ticketId}`, data, cfg);
    const ticket = result?.ticket;

    this.logger.log(
      `✅ [FS] Ticket #${ticketId} updated — ` +
      `[Status: ${FreshserviceService.FS_STATUS_NAMES[ticket?.status] ?? ticket?.status}] ` +
      `[Priority: ${FreshserviceService.FS_PRIORITY_NAMES[ticket?.priority] ?? ticket?.priority}]`,
    );

    return ticket;
  }

  /**
   * addNote()
   * Fired when a Jira comment is CREATED or UPDATED.
   */
  async addNote(
    ticketId: number,
    body: string,
    options: { isPrivate?: boolean; authorName?: string } = {},
    cfg?: CustomerConfig,
  ): Promise<any> {
    const { isPrivate = false, authorName = 'Jira (via Sync)' } = options;

    this.logger.log(
      `\n💬 [FS] addNote → Ticket #${ticketId} [${isPrivate ? 'Private' : 'Public'}]`,
    );

    const payload = {
      body,
      private: isPrivate,
    };

    const result = await this.request(
      'post',
      `/api/v2/tickets/${ticketId}/notes`,
      payload,
      cfg,
    );

    this.logger.log(`✅ [FS] Note added to ticket #${ticketId}`);
    return result?.note;
  }

  /**
   * getConversations()
   * Fetches all notes and replies for a specific ticket.
   */
  async getConversations(ticketId: number, cfg?: CustomerConfig): Promise<any[]> {
    this.logger.log(`\n🔍 [FS] Fetching conversations for Ticket #${ticketId}`);
    try {
      const result = await this.request('get', `/api/v2/tickets/${ticketId}?include=conversations`, undefined, cfg);

      this.logger.log(
        `📡 [FS API] GET Conversations Response for #${ticketId}:\n` +
        JSON.stringify(result?.ticket?.conversations || [], null, 2)
      );

      return result?.ticket?.conversations ?? [];
    } catch (err) {
      this.logger.error(`❌ [FS] Failed to fetch conversations for Ticket #${ticketId}`);
      return [];
    }
  }

  /**
   * uploadAttachments()  [Jira → Freshservice]
   */
  async uploadAttachments(
    ticketId: number,
    attachments: Array<{ filename: string; content_url: string }>,
    authorName = 'Jira (via Sync)',
    cfg?: CustomerConfig,
  ): Promise<{ uploaded: number; fallback: number }> {
    this.logger.log(
      `\n📎 [FS] uploadAttachments → Ticket #${ticketId} — ${attachments.length} attachment(s)`,
    );

    let uploaded = 0;
    const failed: Array<{ filename: string; content_url: string }> = [];

    const jiraEmail = cfg?.jiraEmail || this.configService.get<string>('JIRA_EMAIL') as string;
    const jiraToken = cfg?.jiraApiToken || this.configService.get<string>('JIRA_API_TOKEN') as string;
    const jiraBasic = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const fsApiKey  = cfg?.freshserviceApiKey || this.configService.get<string>('FRESHSERVICE_API_KEY') as string;
    const fsBasic   = Buffer.from(`${fsApiKey}:X`).toString('base64');
    const fsBaseUrl = this.getBaseUrl(cfg);

    for (const attachment of attachments) {
      try {
        this.logger.log(`   📥 Downloading "${attachment.filename}" from Jira...`);
        const fileRes = await axios.get<Buffer>(attachment.content_url, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Basic ${jiraBasic}` },
          timeout: 30_000,
        });

        const buffer      = Buffer.from(fileRes.data);
        const contentType = (fileRes.headers['content-type'] as string) ?? 'application/octet-stream';
        this.logger.log(`   ✅ Downloaded ${buffer.length} bytes (${contentType})`);

        const form = new FormData();
        form.append(
          'body',
          `<p><strong>📎 Attachment synced from Jira</strong> — ${authorName}</p>` +
          `<p>File: <em>${attachment.filename}</em></p>`,
        );
        form.append('private', 'false');
        form.append('attachments[]', buffer, {
          filename:    attachment.filename,
          contentType,
        });

        await axios.post(
          `${fsBaseUrl}/api/v2/tickets/${ticketId}/notes`,
          form,
          {
            headers: {
              Authorization: `Basic ${fsBasic}`,
              ...form.getHeaders(),
            },
            timeout: 60_000,
          },
        );

        this.logger.log(`   ✅ [FS] "${attachment.filename}" uploaded to ticket #${ticketId}`);
        uploaded++;

      } catch (err) {
        this.logger.warn(
          `   ⚠️  [FS] Failed to upload "${attachment.filename}": ${err?.message} — will add link note`,
        );
        failed.push(attachment);
      }
    }

    // Fallback: add a note with download links for failed uploads
    if (failed.length > 0) {
      const links = failed
        .map((a) => `<li><a href="${a.content_url}" target="_blank">${a.filename}</a></li>`)
        .join('');
      const body =
        `<p><strong>📎 Attachments from Jira (download links)</strong> — ${authorName}</p>` +
        `<ul>${links}</ul>`;
      await this.request('post', `/api/v2/tickets/${ticketId}/notes`, { body, private: false }, cfg);
      this.logger.log(`   ℹ️  [FS] Fallback link note added for ${failed.length} attachment(s)`);
    }

    this.logger.log(
      `✅ [FS] Attachment sync done for ticket #${ticketId}: ${uploaded} uploaded, ${failed.length} fallback`,
    );
    return { uploaded, fallback: failed.length };
  }

  /**
   * getTicket()
   * Fetch full ticket details from Freshservice.
   */
  async getTicket(ticketId: number, cfg?: CustomerConfig): Promise<any> {
    this.logger.log(`\n🔍 [FS] getTicket #${ticketId}`);
    const result = await this.request('get', `/api/v2/tickets/${ticketId}`, undefined, cfg);
    return result?.ticket;
  }
}
