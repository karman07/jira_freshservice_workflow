'use client';

import { useState } from 'react';
import type { Customer } from '@/lib/types';
import { CopyButton } from '@/components/shared/CopyButton';
import { BarChart2, ExternalLink, Trash2, Power, Zap } from 'lucide-react';
import { relativeTime } from '@/lib/utils';
import Link from 'next/link';

interface CustomerCardProps {
  customer: Customer;
  onToggle: (slug: string) => Promise<void>;
  onDelete: (customer: Customer) => void;
}

export function CustomerCard({ customer, onToggle, onDelete }: CustomerCardProps) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(customer.slug);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className={`relative rounded-2xl border bg-[var(--bg-surface)] p-5 transition-all duration-200 hover:border-[var(--primary)]/30 hover:-translate-y-0.5 ${
        customer.isActive ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-70'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
              customer.isActive ? 'bg-[var(--primary)]' : 'bg-[var(--bg-elevated)]'
            }`}
          >
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[var(--text)] truncate">{customer.name}</h3>
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--muted)] flex-shrink-0">
                {customer.slug}
              </span>
            </div>
            {customer.description && (
              <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
                {customer.description}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={toggling}
          title={customer.isActive ? 'Disable' : 'Enable'}
          className={`flex-shrink-0 ml-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 disabled:opacity-50 ${
            customer.isActive
              ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
              : 'bg-[var(--bg-elevated)] text-[var(--muted)] border border-[var(--border)] hover:border-[var(--primary)]/30'
          }`}
        >
          {toggling ? '...' : customer.isActive ? 'Active' : 'Inactive'}
        </button>
      </div>

      {/* URLs */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--muted)] w-8 flex-shrink-0">JIRA</span>
          <span className="text-xs font-mono text-[var(--primary)] truncate flex-1">
            {customer.jiraBaseUrl || '—'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--muted)] w-8 flex-shrink-0">FS</span>
          <span className="text-xs font-mono text-[var(--muted)] truncate flex-1">
            {customer.freshserviceBaseUrl || <span className="italic">Using global default</span>}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center bg-[var(--bg-elevated)]/50 rounded-xl p-2">
          <p className="text-sm font-bold text-[var(--text)]">{customer.totalSyncs}</p>
          <p className="text-[10px] text-[var(--muted)]">Total</p>
        </div>
        <div className="text-center bg-[var(--bg-elevated)]/50 rounded-xl p-2">
          <p className="text-sm font-bold text-green-400">{customer.successfulSyncs}</p>
          <p className="text-[10px] text-[var(--muted)]">Success</p>
        </div>
        <div className="text-center bg-[var(--bg-elevated)]/50 rounded-xl p-2">
          <p className="text-sm font-bold text-red-400">{customer.failedSyncs}</p>
          <p className="text-[10px] text-[var(--muted)]">Failed</p>
        </div>
      </div>

      {/* Last webhook */}
      <div className="mb-4">
        <p className="text-xs text-[var(--muted)]">
          Last sync:{' '}
          <span className="text-[var(--text)]">
            {customer.lastWebhookAt ? relativeTime(customer.lastWebhookAt) : 'Never'}
          </span>
        </p>
      </div>

      {/* Webhook URLs */}
      <div className="bg-[var(--bg-base)] rounded-xl p-3 mb-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-[var(--muted)] flex-shrink-0" />
          <span className="text-[10px] font-mono text-[var(--muted)] flex-1 truncate">
            {customer.webhookJiraUrl}
          </span>
          <CopyButton value={customer.webhookJiraUrl} />
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-[var(--muted)] flex-shrink-0" />
          <span className="text-[10px] font-mono text-[var(--muted)] flex-1 truncate">
            {customer.webhookFreshserviceUrl}
          </span>
          <CopyButton value={customer.webhookFreshserviceUrl} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/customers/${customer.slug}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all border border-[var(--primary)]/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View
        </Link>
        <Link
          href={`/dashboard/customers/${customer.slug}/analytics`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]/80 transition-all border border-[var(--border)]"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Analytics
        </Link>
        <button
          onClick={() => onDelete(customer)}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 border border-[var(--border)] hover:border-red-500/20 transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 border border-[var(--border)] transition-all disabled:opacity-50"
          title="Toggle"
        >
          <Power className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
