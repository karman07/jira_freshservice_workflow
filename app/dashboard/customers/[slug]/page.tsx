'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart2,
  Power,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Customer, CreateCustomerPayload } from '@/lib/types';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { WebhookPanel } from '@/components/customers/WebhookPanel';
import { DangerZone } from '@/components/customers/DangerZone';
import { FsPairPanel } from '@/components/customers/FsPairPanel';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { toast } from '@/components/shared/Toast';
import { relativeTime } from '@/lib/utils';

export default function CustomerDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  async function load() {
    try {
      const data = await api.getCustomer(slug);
      setCustomer(data);
    } catch {
      toast('error', 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [slug]);

  async function handleUpdate(data: Partial<CreateCustomerPayload>) {
    if (!customer) return;
    const updated = await api.updateCustomer(slug, data);
    setCustomer(updated);
    toast('success', 'Customer updated successfully!');
  }

  async function handleToggle() {
    if (!customer) return;
    setToggling(true);
    try {
      const updated = await api.toggleCustomer(slug);
      setCustomer(updated);
      toast('success', `Customer ${updated.isActive ? 'enabled' : 'disabled'}`);
    } catch {
      toast('error', 'Failed to toggle customer');
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    await api.deleteCustomer(slug);
    toast('success', 'Customer deleted');
    router.push('/dashboard/customers');
  }

  if (loading) return <PageLoader />;
  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--muted)]">Customer not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/customers"
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)]/50 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">{customer.name}</h1>
              <span className="px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-xs font-mono text-[var(--muted)]">
                {customer.slug}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              Customer configuration and settings
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/customers/${slug}/analytics`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] text-sm font-medium transition-all"
        >
          <BarChart2 className="w-4 h-4" />
          View Analytics
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="xl:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <CustomerForm
            initialData={customer}
            onSubmit={handleUpdate}
            submitLabel="Save Changes"
          />
        </div>

        {/* Right: Info panel */}
        <div className="space-y-4">
          {/* Status card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
              Status
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-3 h-3 rounded-full ${
                  customer.isActive ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-[var(--muted)]'
                }`}
              />
              <span className="text-sm font-medium text-[var(--text)]">
                {customer.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {customer.lastWebhookAt && (
              <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-4">
                <Clock className="w-3.5 h-3.5" />
                Last sync: {relativeTime(customer.lastWebhookAt)}
              </div>
            )}
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${
                customer.isActive
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/15'
              }`}
            >
              <Power className="w-4 h-4" />
              {toggling
                ? 'Processing...'
                : customer.isActive
                ? 'Disable Customer'
                : 'Enable Customer'}
            </button>
          </div>

          {/* Webhook URLs */}
          <WebhookPanel
            jiraUrl={customer.webhookJiraUrl}
            freshserviceUrl={customer.webhookFreshserviceUrl}
          />

          {/* FS ↔ FS Pair Panel */}
          <FsPairPanel
            slug={slug}
            webhookFsPairUrl={customer.webhookFsPairUrl}
            fsPairEnabled={customer.fsPairEnabled}
          />

          {/* Mini stats */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
              Sync Statistics
            </h3>
            <div className="space-y-3">
              <StatRow
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                label="Total Syncs"
                value={customer.totalSyncs}
                color="text-[var(--primary)]"
              />
              <StatRow
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                label="Successful"
                value={customer.successfulSyncs}
                color="text-green-400"
              />
              <StatRow
                icon={<XCircle className="w-3.5 h-3.5" />}
                label="Failed"
                value={customer.failedSyncs}
                color="text-red-400"
              />
            </div>
          </div>

          {/* Danger zone */}
          <DangerZone customerName={customer.name} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={color}>{icon}</span>
      <span className="text-sm text-[var(--muted)] flex-1">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
