'use client';

import { useEffect, useState } from 'react';
import { Users, CheckCircle, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Customer, DashboardResponse } from '@/lib/types';
import { StatCard } from '@/components/shared/StatCard';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { DailyActivityChart } from '@/components/analytics/DailyActivityChart';
import { EventBreakdownChart } from '@/components/analytics/EventBreakdownChart';
import { SyncLogTable } from '@/components/analytics/SyncLogTable';
import { toast } from '@/components/shared/Toast';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.listCustomers()])
      .then(([dash, custs]) => {
        setData(dash);
        setCustomers(custs);
      })
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

  // Build customerId → slug map for the log table
  const customerNames: Record<string, string> = {};
  customers.forEach((c) => { customerNames[c._id] = c.slug; });

  const failedLogs = recentLogs.filter((l) => l.status === 'failed');

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Overview</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Global sync platform analytics and recent activity
        </p>
      </div>

      {/* Error banner — shows if there are recent failures */}
      {failedLogs.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-red-500/20 bg-red-500/5">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">
              {failedLogs.length} recent sync failure{failedLogs.length > 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-red-400/70 mt-0.5">
              {failedLogs.slice(0, 2).map((l) => (
                <span key={l._id} className="block">
                  {customerNames[l.customerId] ?? l.customerId.slice(-6)} —{' '}
                  {l.errorCode && <span className="font-mono bg-red-500/15 px-1 rounded mr-1">{l.errorCode}</span>}
                  {l.errorMessage?.split('\n')[0]?.slice(0, 80)}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

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
          subtitle={`${overview.failedCount} failed · ${overview.skippedCount} skipped`}
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
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">
              Recent Sync Logs
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">Latest synchronization events across all customers</p>
          </div>
          {failedLogs.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
              {failedLogs.length} error{failedLogs.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <SyncLogTable logs={recentLogs} customerNames={customerNames} />
      </div>
    </div>
  );
}
