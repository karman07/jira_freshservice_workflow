'use client';

import { useEffect, useState } from 'react';
import { Users, CheckCircle, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardResponse } from '@/lib/types';
import { StatCard } from '@/components/shared/StatCard';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { DailyActivityChart } from '@/components/analytics/DailyActivityChart';
import { EventBreakdownChart } from '@/components/analytics/EventBreakdownChart';
import { SyncLogTable } from '@/components/analytics/SyncLogTable';
import { toast } from '@/components/shared/Toast';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch(() => toast('error', 'Failed to load dashboard data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--muted)]">No dashboard data available.</p>
      </div>
    );
  }

  const { overview, dailyActivity, eventBreakdown, recentLogs } = data;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Overview</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Global sync platform analytics and recent activity
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={overview.totalCustomers}
          icon={<Users className="w-5 h-5" />}
          subtitle={`${overview.activeCustomers} active`}
        />
        <StatCard
          title="Active Instances"
          value={overview.activeCustomers}
          icon={<CheckCircle className="w-5 h-5" />}
          accent="success"
          subtitle="Currently enabled"
        />
        <StatCard
          title="Total Syncs"
          value={overview.totalSyncs.toLocaleString()}
          icon={<RefreshCw className="w-5 h-5" />}
          subtitle={`${overview.failedCount} failed, ${overview.skippedCount} skipped`}
        />
        <StatCard
          title="Success Rate"
          value={`${overview.successRate}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          accent={overview.successRate >= 90 ? 'success' : overview.successRate >= 70 ? 'warning' : 'danger'}
          subtitle={`${overview.successCount} successful syncs`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DailyActivityChart data={dailyActivity} />
        <EventBreakdownChart data={eventBreakdown} />
      </div>

      {/* Recent Logs */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">
            Recent Sync Logs
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Latest synchronization events</p>
        </div>
        <SyncLogTable logs={recentLogs} />
      </div>
    </div>
  );
}
