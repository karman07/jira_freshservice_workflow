import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

/**
 * FreshserviceService (Stub)
 * ──────────────────────────
 * This is a stub file created during Step 2 (project structure).
 * Full implementation will be added in Step 6.
 *
 * Will provide:
 *   - createTicket(data)        → POST to Freshservice REST API
 *   - updateTicket(id, data)    → PUT to Freshservice REST API
 *   - addNote(ticketId, body)   → POST to Freshservice ticket notes
 */
@Injectable()
export class FreshserviceService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Full implementations coming in Step 6
}
