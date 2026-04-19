import { CopyButton } from '@/components/shared/CopyButton';
import { Zap } from 'lucide-react';

interface WebhookPanelProps {
  jiraUrl: string;
  freshserviceUrl: string;
}

export function WebhookPanel({ jiraUrl, freshserviceUrl }: WebhookPanelProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
      <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
        Webhook URLs
      </h3>
      <WebhookRow label="Jira Webhook" url={jiraUrl} accent="blue" />
      <WebhookRow label="Freshservice Webhook" url={freshserviceUrl} accent="green" />
    </div>
  );
}

function WebhookRow({
  label,
  url,
  accent,
}: {
  label: string;
  url: string;
  accent: 'blue' | 'green';
}) {
  const color = accent === 'blue' ? 'text-[var(--primary)]' : 'text-green-400';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Zap className={`w-3.5 h-3.5 ${color}`} />
        <p className={`text-xs font-medium ${color}`}>{label}</p>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border)]">
        <code className="text-[11px] font-mono text-[var(--muted)] flex-1 break-all leading-relaxed">
          {url}
        </code>
        <CopyButton value={url} />
      </div>
    </div>
  );
}
