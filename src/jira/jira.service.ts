import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { CustomerConfig } from '../admin/customer-config.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');

/**
 * JiraService
 * ───────────
 * Handles ALL outbound REST API calls to Jira Cloud.
 *
 * Now fully multi-tenant: every public method accepts an optional
 * CustomerConfig object. When provided, it uses customer-specific
 * credentials; otherwise falls back to global .env values.
 *
 * Jira priority names: Highest | High | Medium | Low | Lowest
 * Jira status names depend on the workflow (To Do | In Progress | Done)
 */
@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Private Helpers — tenant-aware
  // ─────────────────────────────────────────────────────────────

  private getBaseUrl(cfg?: CustomerConfig): string {
    return cfg?.jiraBaseUrl ||
      this.configService.get<string>('JIRA_BASE_URL') as string;
  }

  private getHeaders(cfg?: CustomerConfig) {
    const email = cfg?.jiraEmail || this.configService.get<string>('JIRA_EMAIL');
    const token = cfg?.jiraApiToken || this.configService.get<string>('JIRA_API_TOKEN');
    const encoded = Buffer.from(`${email}:${token}`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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
    this.logger.log(`📡 [JIRA] ${method.toUpperCase()} → ${url}`);
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
        error?.response?.data?.errorMessages?.join(', ') ||
        error?.response?.data?.message ||
        error?.message;
      const errors = error?.response?.data?.errors;

      this.logger.error(
        `❌ [JIRA] ${method.toUpperCase()} ${path} → [${status}] ${msg}`,
      );
      if (errors) {
        this.logger.error(
          `📝 Field errors: ${JSON.stringify(errors, null, 2)}`,
        );
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Static Maps (Freshservice → Jira)
  // ─────────────────────────────────────────────────────────────

  /**
   * Freshservice priority code → Jira priority name
   * FS: 1=Low  2=Medium  3=High  4=Urgent
   */
  static readonly PRIORITY_MAP: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Highest',
  };

  /**
   * Freshservice status code → Jira transition name
   * FS: 2=Open  3=Pending  4=Resolved  5=Closed
   */
  static readonly STATUS_NAME_MAP: Record<number, string> = {
    2: 'To Do',
    3: 'In Progress',
    4: 'Done',
    5: 'Done',
  };

  // ─────────────────────────────────────────────────────────────
  // Public API Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * createIssue()
   * Fired when a Freshservice ticket is CREATED.
   */
  async createIssue(
    data: {
      summary: string;
      description: string;
      priority: string;
      projectKey?: string;
      issueType?: string;
    },
    cfg?: CustomerConfig,
  ): Promise<any> {
    const projectKey =
      data.projectKey ??
      cfg?.jiraProjectKey ??
      this.configService.get<string>('JIRA_PROJECT_KEY') ??
      'SCRUM';
    const issueType = data.issueType ?? 'Task';

    this.logger.log(`\n🚀 [JIRA] createIssue → "${data.summary}"`);

    const payload = {
      fields: {
        project: { key: projectKey },
        summary: data.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: data.description || 'No description provided.',
                },
              ],
            },
          ],
        },
        issuetype: { name: issueType },
        priority: { name: data.priority ?? 'Medium' },
        labels: ['freshservice-sync'],
      },
    };

    const result = await this.request('post', '/rest/api/3/issue', payload, cfg);

    this.logger.log(
      `✅ [JIRA] Issue created: ${result?.key} — "${data.summary}"`,
    );

    return result; // { id, key, self }
  }

  /**
   * updateIssue()
   * Fired when a Freshservice ticket is UPDATED.
   */
  async updateIssue(
    issueKey: string,
    data: {
      summary?: string;
      description?: string;
      priority?: string;
    },
    cfg?: CustomerConfig,
  ): Promise<void> {
    this.logger.log(
      `\n🔄 [JIRA] updateIssue ${issueKey} → ${JSON.stringify(data)}`,
    );

    const fields: any = {};

    if (data.summary) fields.summary = data.summary;

    if (data.description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: data.description }],
          },
        ],
      };
    }

    if (data.priority) {
      fields.priority = { name: data.priority };
    }

    await this.request('put', `/rest/api/3/issue/${issueKey}`, { fields }, cfg);

    this.logger.log(`✅ [JIRA] Issue ${issueKey} updated`);
  }

  /**
   * addComment()
   * Fired when a Freshservice note is CREATED.
   */
  async addComment(
    issueKey: string,
    body: string,
    authorName = 'Freshservice (via Sync)',
    cfg?: CustomerConfig,
  ): Promise<any> {
    this.logger.log(`\n💬 [JIRA] addComment → ${issueKey}`);

    const payload = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      },
    };

    const result = await this.request(
      'post',
      `/rest/api/3/issue/${issueKey}/comment`,
      payload,
      cfg,
    );

    this.logger.log(`✅ [JIRA] Comment added to ${issueKey}`);
    return result;
  }

  /**
   * transitionIssue()
   * Changes the status of a Jira issue.
   */
  async transitionIssue(issueKey: string, targetStatus: string, cfg?: CustomerConfig): Promise<void> {
    this.logger.log(
      `\n🔀 [JIRA] transitionIssue ${issueKey} → "${targetStatus}"`,
    );

    const transitionsData = await this.request(
      'get',
      `/rest/api/3/issue/${issueKey}/transitions`,
      undefined,
      cfg,
    );

    const transitions: Array<{ id: string; name: string }> =
      transitionsData?.transitions ?? [];

    this.logger.debug(
      `🔍 Available transitions: ${transitions.map((t) => `${t.name}(${t.id})`).join(', ')}`,
    );

    const target = transitions.find(
      (t) => t.name.toLowerCase() === targetStatus.toLowerCase(),
    );

    if (!target) {
      this.logger.warn(
        `⚠️  [JIRA] No matching transition for "${targetStatus}" on ${issueKey}. ` +
          `Available: ${transitions.map((t) => t.name).join(', ')}`,
      );
      return;
    }

    await this.request('post', `/rest/api/3/issue/${issueKey}/transitions`, {
      transition: { id: target.id },
    }, cfg);

    this.logger.log(
      `✅ [JIRA] ${issueKey} transitioned to "${targetStatus}" (id: ${target.id})`,
    );
  }

  /**
   * getIssue()
   * Fetch full issue details from Jira.
   */
  async getIssue(issueKey: string, cfg?: CustomerConfig): Promise<any> {
    this.logger.log(`\n🔍 [JIRA] getIssue ${issueKey}`);
    return this.request('get', `/rest/api/3/issue/${issueKey}`, undefined, cfg);
  }

  /**
   * uploadAttachments()  [Freshservice → Jira]
   */
  async uploadAttachments(
    issueKey: string,
    attachments: Array<{ name: string; attachment_url: string }>,
    authorName = 'Freshservice (via Sync)',
    cfg?: CustomerConfig,
  ): Promise<{ uploaded: number; fallback: number }> {
    this.logger.log(
      `\n📎 [JIRA] uploadAttachments → ${issueKey} — ${attachments.length} attachment(s)`,
    );

    let uploaded = 0;
    const failed: Array<{ name: string; attachment_url: string }> = [];

    const fsApiKey  = cfg?.freshserviceApiKey || this.configService.get<string>('FRESHSERVICE_API_KEY') as string;
    const fsBasic   = Buffer.from(`${fsApiKey}:X`).toString('base64');
    const jiraEmail = cfg?.jiraEmail || this.configService.get<string>('JIRA_EMAIL') as string;
    const jiraToken = cfg?.jiraApiToken || this.configService.get<string>('JIRA_API_TOKEN') as string;
    const jiraBasic = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const jiraBaseUrl = this.getBaseUrl(cfg);

    for (const attachment of attachments) {
      try {
        this.logger.log(`   📥 Downloading "${attachment.name}" from Freshservice...`);
        const fileRes = await axios.get<Buffer>(attachment.attachment_url, {
          responseType: 'arraybuffer',
          headers: { Authorization: `Basic ${fsBasic}` },
          timeout: 30_000,
        });

        const buffer      = Buffer.from(fileRes.data);
        const contentType = (fileRes.headers['content-type'] as string) ?? 'application/octet-stream';
        this.logger.log(`   ✅ Downloaded ${buffer.length} bytes (${contentType})`);

        const form = new FormData();
        form.append('file', buffer, {
          filename:    attachment.name,
          contentType,
        });

        await axios.post(
          `${jiraBaseUrl}/rest/api/3/issue/${issueKey}/attachments`,
          form,
          {
            headers: {
              Authorization:        `Basic ${jiraBasic}`,
              'X-Atlassian-Token': 'no-check',
              ...form.getHeaders(),
            },
            timeout: 60_000,
          },
        );

        this.logger.log(`   ✅ [JIRA] "${attachment.name}" uploaded to ${issueKey}`);
        uploaded++;

      } catch (err) {
        this.logger.warn(
          `   ⚠️  [JIRA] Failed to upload "${attachment.name}": ${err?.message} — will add link comment`,
        );
        failed.push(attachment);
      }
    }

    if (failed.length > 0) {
      await this.addAttachmentComment(issueKey, failed, authorName, cfg);
      this.logger.log(`   ℹ️  [JIRA] Fallback link comment added for ${failed.length} attachment(s)`);
    }

    this.logger.log(
      `✅ [JIRA] Attachment sync done for ${issueKey}: ${uploaded} uploaded, ${failed.length} fallback`,
    );
    return { uploaded, fallback: failed.length };
  }

  /**
   * addAttachmentComment()  [private fallback]
   */
  private async addAttachmentComment(
    issueKey: string,
    attachments: Array<{ name: string; attachment_url: string }>,
    authorName = 'Freshservice (via Sync)',
    cfg?: CustomerConfig,
  ): Promise<void> {
    const fileList = attachments.map((a) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: a.name,
              marks: [{ type: 'link', attrs: { href: a.attachment_url } }],
            },
          ],
        },
      ],
    }));

    const payload = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `📎 Attachments from Freshservice — ${authorName} (download links)`,
                marks: [{ type: 'strong' }],
              },
            ],
          },
          { type: 'bulletList', content: fileList },
        ],
      },
    };

    await this.request('post', `/rest/api/3/issue/${issueKey}/comment`, payload, cfg);
    this.logger.log(`✅ [JIRA] Fallback attachment comment added to ${issueKey}`);
  }
}
