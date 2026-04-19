'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { CustomerAnalyticsResponse } from '@/lib/types';
import { StatCard } from '@/components/shared/StatCard';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { DailyActivityChart } from '@/components/analytics/DailyActivityChart';
import { EventBreakdownChart } from '@/components/analytics/EventBreakdownChart';
import { SyncLogTable } from '@/components/analytics/SyncLogTable';
import { toast } from '@/components/shared/Toast';

export default function CustomerAnalyticsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CustomerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getCustomerAnalytics(slug)
      .then(setData)
      .catch(() => toast('error', 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <PageLoader />;
  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--muted)]">Analytics not available.</p>
      </div>
    );
  }

  const { customer, stats, dailyActivity, eventBreakdown, recentLogs } = data;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/customers/${slug}`}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)]/50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text)]">{customer.name}</h1>
            <span className="px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-xs font-mono text-[var(--muted)]">
              Analytics
            </span>
          </div>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Sync performance and event breakdown
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Syncs"
          value={stats.total.toLocaleString()}
          icon={<RefreshCw className="w-5 h-5" />}
          subtitle={`${stats.skipped} skipped`}
        />
        <StatCard
          title="Successful"
          value={stats.successes.toLocaleString()}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="success"
        />
        <StatCard
          title="Failed"
          value={stats.failures.toLocaleString()}
          icon={<XCircle className="w-5 h-5" />}
          accent="danger"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          accent={
            stats.successRate >= 90
              ? 'success'
              : stats.successRate >= 70
              ? 'warning'
              : 'danger'
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DailyActivityChart data={dailyActivity} />
        <EventBreakdownChart data={eventBreakdown} />
      </div>

      {/* Sync Log Table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">
              Sync Logs
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Most recent {recentLogs.length} events
            </p>
          </div>
        </div>
        <SyncLogTable logs={recentLogs} />
      </div>
    </div>
  );
}
