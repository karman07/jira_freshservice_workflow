import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FreshserviceService {
  private readonly logger = new Logger(FreshserviceService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Build auth headers for Freshservice API.
   * Freshservice uses Basic Auth: API_KEY:X as base64
   */
  private getHeaders() {
    const apiKey = this.configService.get<string>('FRESHSERVICE_API_KEY');
    const encoded = Buffer.from(`${apiKey}:X`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * createTicket()
   * Called when a Jira issue_created event arrives.
   * Makes a real POST request to Freshservice /api/v2/tickets
   */
  async createTicket(data: any) {
    const baseUrl = this.configService.get<string>('FRESHSERVICE_BASE_URL');
    const url = `${baseUrl}/api/v2/tickets`;

    this.logger.log(`\n🚀 [FRESHSERVICE] Calling createTicket`);
    this.logger.log(`📡 POST → ${url}`);
    this.logger.log(`📦 Payload: ${JSON.stringify(data, null, 2)}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, data, { headers: this.getHeaders() }),
      );

      this.logger.log(`✅ Freshservice ticket created successfully`);
      this.logger.log(`📄 Response: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    } catch (error) {
      const status = error?.response?.status || 'UNKNOWN';
      const message = error?.response?.data?.message || error?.message;
      const errors = error?.response?.data?.errors;
      
      this.logger.error(`❌ Freshservice Error [${status}]: ${message}`);
      if (errors) {
        this.logger.error(`📝 Validation Errors: ${JSON.stringify(errors, null, 2)}`);
      }
      throw error;
    }
  }
}
