export interface Customer {
  _id: string;
  name: string;
  slug: string;
  description?: string;

  // Jira
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;

  // Freshservice (optional)
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;

  isActive: boolean;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastWebhookAt?: string;

  webhookJiraUrl: string;
  webhookFreshserviceUrl: string;

  createdAt: string;
  updatedAt: string;
}

export interface SyncLog {
  _id: string;
  customerId: string;
  eventType: string;
  source: string;
  destination: string;
  jiraIssueKey?: string;
  freshserviceTicketId?: number;
  status: 'success' | 'failed' | 'skipped';
  createdAt: string;
}

export interface EventBreakdown {
  _id: string;
  count: number;
  successes: number;
  failures: number;
}

export interface DailyActivity {
  _id: string;
  total: number;
  successes: number;
  failures: number;
}

export interface CustomerBreakdown {
  _id: string;
  total: number;
  successes: number;
  failures: number;
}

export interface DashboardOverview {
  totalCustomers: number;
  activeCustomers: number;
  totalSyncs: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  successRate: number;
}

export interface DashboardResponse {
  overview: DashboardOverview;
  eventBreakdown: EventBreakdown[];
  customerBreakdown: CustomerBreakdown[];
  dailyActivity: DailyActivity[];
  recentLogs: SyncLog[];
}

export interface CustomerAnalyticsStats {
  total: number;
  successes: number;
  failures: number;
  skipped: number;
  successRate: number;
}

export interface CustomerAnalyticsResponse {
  customer: Customer;
  stats: CustomerAnalyticsStats;
  eventBreakdown: EventBreakdown[];
  dailyActivity: DailyActivity[];
  recentLogs: SyncLog[];
}

export interface CreateCustomerPayload {
  name: string;
  slug: string;
  description?: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;
}
