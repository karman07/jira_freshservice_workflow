'use client';

import { SyncLog } from '@/lib/types';
import { Badge } from '@/components/shared/Badge';
import { formatEventType, relativeTime, formatDate } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

interface SyncLogTableProps {
  logs: SyncLog[];
}

export function SyncLogTable({ logs }: SyncLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">
        No sync logs found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {['Status', 'Event', 'Flow', 'Jira Key', 'FS Ticket', 'Time'].map((col) => (
              <th
                key={col}
                className="text-left py-3 px-4 text-xs font-medium text-[var(--muted)] uppercase tracking-wider"
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
              className={`border-b border-[var(--border)]/50 hover:bg-[var(--bg-elevated)]/40 transition-colors ${
                idx % 2 === 0 ? '' : 'bg-[var(--bg-base)]/30'
              }`}
            >
              <td className="py-3 px-4">
                <Badge status={log.status} />
              </td>
              <td className="py-3 px-4 text-[var(--text)]">
                {formatEventType(log.eventType)}
              </td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center gap-1.5 text-[var(--muted)] font-mono text-xs">
                  <span className="text-[var(--primary)]">{log.source}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="text-[var(--text)]">{log.destination}</span>
                </span>
              </td>
              <td className="py-3 px-4 font-mono text-xs text-[var(--primary)]">
                {log.jiraIssueKey ?? '—'}
              </td>
              <td className="py-3 px-4 font-mono text-xs text-[var(--muted)]">
                {log.freshserviceTicketId ? `#${log.freshserviceTicketId}` : '—'}
              </td>
              <td className="py-3 px-4 text-[var(--muted)]">
                <span title={formatDate(log.createdAt)} className="cursor-help">
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
