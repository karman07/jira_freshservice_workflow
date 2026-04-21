'use client';

import { useEffect, useState } from 'react';
import { Link2, ArrowLeftRight, Clock, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { FsPairStats, FsPairMapping } from '@/lib/types';

/** Status code → label map (FS v2 API) */
const FS_STATUS: Record<number, string> = {
  2: 'Open',
  3: 'Pending',
  4: 'Resolved',
  5: 'Closed',
};

function StatusBadge({ code }: { code?: number }) {
  const label = code ? FS_STATUS[code] ?? `Status ${code}` : '—';
  const color =
    code === 4 || code === 5
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : code === 3
      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
      : 'text-blue-400 bg-blue-500/10 border-blue-500/20';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${color}`}>
      {label}
    </span>
  );
}

function CopyableUrl({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-[var(--text)] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2 rounded-xl truncate">
          {url}
        </code>
        <button
          onClick={copy}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)]/50 transition-all"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface FsPairPanelProps {
  slug: string;
  webhookFsPairUrl?: string;
  fsPairEnabled?: boolean;
}

export function FsPairPanel({ slug, webhookFsPairUrl, fsPairEnabled }: FsPairPanelProps) {
  const [stats, setStats] = useState<FsPairStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fsPairEnabled) { setLoading(false); return; }
    api.getFsPairStats(slug)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, fsPairEnabled]);

  if (!fsPairEnabled) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ArrowLeftRight className="w-4 h-4 text-[var(--muted)]" />
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            FS ↔ FS Pairing
          </h3>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
          <AlertCircle className="w-4 h-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            FS ↔ FS pairing is <strong>disabled</strong>. Enable it in the configuration form below
            and add your second Freshservice instance credentials to start mirroring tickets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
            <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">FS ↔ FS Pairing</h3>
            <p className="text-[10px] text-green-400 font-medium flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              Active
            </p>
          </div>
        </div>
        {!loading && stats && (
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-purple-400">{stats.total}</p>
            <p className="text-[10px] text-[var(--muted)]">paired tickets</p>
          </div>
        )}
      </div>

      {/* Webhook URLs */}
      {webhookFsPairUrl && (
        <div className="space-y-2">
          <CopyableUrl
            url={`${webhookFsPairUrl}?origin=instanceA`}
            label="Instance A Webhook URL"
          />
          <CopyableUrl
            url={`${webhookFsPairUrl}?origin=instanceB`}
            label="Instance B Webhook URL"
          />
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/15">
            <Link2 className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-purple-300 leading-relaxed">
              Configure both URLs as Freshservice Automation webhooks (under Admin → Automations → Supervisor Rules).
              The <code className="bg-purple-500/10 px-1 rounded">?origin=</code> parameter tells the system which instance sent the event.
            </p>
          </div>
        </div>
      )}

      {/* Recent pair mappings */}
      {!loading && stats && stats.recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
            Recent Paired Tickets
          </p>
          <div className="space-y-2">
            {stats.recent.map((pair: FsPairMapping) => (
              <div
                key={pair._id}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]"
              >
                <div className="flex items-center gap-1.5 text-sm font-mono font-bold text-[var(--text)] min-w-0">
                  <span className="text-blue-400">#{pair.instanceATicketId}</span>
                  <ArrowLeftRight className="w-3 h-3 text-[var(--muted)] flex-shrink-0" />
                  <span className="text-purple-400">#{pair.instanceBTicketId}</span>
                </div>
                <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                  <StatusBadge code={pair.instanceAStatus} />
                  <StatusBadge code={pair.instanceBStatus} />
                </div>
                {pair.lastSyncedAt && (
                  <div className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--muted)] flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(pair.lastSyncedAt).toLocaleDateString()}
                  </div>
                )}
                <div className="flex-shrink-0">
                  {pair.lastUpdatedSource === 'instanceA'
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    : <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && stats && stats.recent.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-[var(--muted)]">
            No paired tickets yet. Create a ticket in either Freshservice instance to start mirroring.
          </p>
        </div>
      )}
    </div>
  );
}
