'use client';

import { useState } from 'react';
import { SyncLog } from '@/lib/types';
import { Badge } from '@/components/shared/Badge';
import { formatEventType, relativeTime, formatDate } from '@/lib/utils';
import { ArrowRight, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

interface SyncLogTableProps {
  logs: SyncLog[];
  customerNames?: Record<string, string>; // customerId -> displayName
}

function ErrorDetail({ log }: { log: SyncLog }) {
  const [open, setOpen] = useState(false);
  if (!log.errorMessage && !log.errorCode) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
      >
        <AlertCircle className="w-3 h-3" />
        {log.errorCode && (
          <span className="font-mono bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
            {log.errorCode}
          </span>
        )}
        <span className="truncate max-w-[180px]">{log.errorMessage?.split('\n')[0]}</span>
        {open ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
      </button>
      {open && (
        <div className="mt-1.5 p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-[10px] font-mono text-red-300 break-all max-w-xs leading-relaxed">
          {log.errorMessage}
        </div>
      )}
    </div>
  );
}

export function SyncLogTable({ logs, customerNames }: SyncLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--muted)] text-sm">
        <div className="text-2xl mb-2">📋</div>
        No sync logs found yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {['Status', 'Event', 'Flow', 'Customer', 'Jira Key', 'FS Ticket', 'Time'].map((col) => (
              <th
                key={col}
                className="text-left py-3 px-4 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log, idx) => (
            <tr
              key={log._id}
              className={`border-b border-[var(--border)]/40 hover:bg-[var(--bg-elevated)]/50 transition-colors ${
                idx % 2 === 0 ? '' : 'bg-[var(--bg-base)]/20'
              }`}
            >
              {/* Status */}
              <td className="py-3 px-4 align-top">
                <div>
                  <Badge status={log.status} />
                  <ErrorDetail log={log} />
                </div>
              </td>

              {/* Event */}
              <td className="py-3 px-4 align-top">
                <span className="text-[var(--text)] whitespace-nowrap font-medium">
                  {formatEventType(log.eventType)}
                </span>
              </td>

              {/* Flow */}
              <td className="py-3 px-4 align-top">
                <span className="inline-flex items-center gap-1.5 text-[var(--muted)] font-mono text-xs whitespace-nowrap">
                  <span className="text-[var(--primary)] font-medium">{log.source}</span>
                  <ArrowRight className="w-3 h-3 text-[var(--muted)]" />
                  <span className="text-[var(--text)]">{log.destination}</span>
                </span>
              </td>

              {/* Customer */}
              <td className="py-3 px-4 align-top">
                {log.customerId ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[var(--bg-elevated)] text-[var(--muted)] border border-[var(--border)] whitespace-nowrap">
                    {customerNames?.[log.customerId] ?? log.customerId.slice(-8)}
                  </span>
                ) : (
                  <span className="text-[var(--muted)] text-xs">—</span>
                )}
              </td>

              {/* Jira Key */}
              <td className="py-3 px-4 align-top">
                {log.jiraIssueKey ? (
                  <span className="font-mono text-xs font-semibold text-[var(--primary)] whitespace-nowrap">
                    {log.jiraIssueKey}
                  </span>
                ) : (
                  <span className="text-[var(--muted)] text-xs">—</span>
                )}
              </td>

              {/* FS Ticket */}
              <td className="py-3 px-4 align-top">
                {log.freshserviceTicketId ? (
                  <span className="font-mono text-xs text-[var(--muted)] whitespace-nowrap">
                    #{log.freshserviceTicketId}
                  </span>
                ) : (
                  <span className="text-[var(--muted)] text-xs">—</span>
                )}
              </td>

              {/* Time */}
              <td className="py-3 px-4 align-top">
                <span
                  title={formatDate(log.createdAt)}
                  className="cursor-help text-[var(--muted)] text-xs whitespace-nowrap"
                >
                  {relativeTime(log.createdAt)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
