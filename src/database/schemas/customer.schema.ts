import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

/**
 * Customer
 * ────────
 * Every customer (tenant) gets their own Jira + Freshservice credential set.
 * The admin creates/manages these via the Admin API.
 * Webhooks are routed per-customer using the customer's slug/id.
 *
 * If Freshservice credentials are not provided, the system falls back to
 * the global .env defaults (FRESHSERVICE_BASE_URL / FRESHSERVICE_API_KEY).
 */
@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  // Human-readable label (e.g. "Acme Corp")
  @Prop({ required: true }) name: string;

  // URL-safe slug used in webhook URLs (e.g. "acme-corp")
  @Prop({ required: true, unique: true, index: true }) slug: string;

  // Optional description / notes about this customer
  @Prop() description: string;

  // ── Jira credentials ──────────────────────────────────────────
  @Prop({ required: true }) jiraBaseUrl: string;
  @Prop({ required: true }) jiraEmail: string;
  @Prop({ required: true }) jiraApiToken: string;
  @Prop({ required: true }) jiraProjectKey: string;

  // ── Freshservice credentials (optional — uses .env defaults if blank) ──
  @Prop() freshserviceBaseUrl: string;
  @Prop() freshserviceApiKey: string;

  // Custom FS field config
  @Prop() fsCustomStatusAwaiting: string;

  // Fallback requester email for FS tickets when reporter has no email
  @Prop() fallbackEmail: string;

  // ── Instance health / sync stats ─────────────────────────────
  // Whether this customer instance is actively processing webhooks
  @Prop({ default: true }) isActive: boolean;

  // Counters for the admin dashboard
  @Prop({ default: 0 }) totalSyncs: number;
  @Prop({ default: 0 }) successfulSyncs: number;
  @Prop({ default: 0 }) failedSyncs: number;

  // Last time a webhook from this customer was processed
  @Prop() lastWebhookAt: Date;

  // Webhook URLs shown to the customer after creation
  @Prop() webhookJiraUrl: string;
  @Prop() webhookFreshserviceUrl: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
