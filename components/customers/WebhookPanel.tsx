import { CopyButton } from '@/components/shared/CopyButton';
import { Share2, Zap } from 'lucide-react';

interface WebhookPanelProps {
  jiraUrl: string;
  freshserviceUrl: string;
  sharedFsUrl?: string;
}

export function WebhookPanel({ jiraUrl, freshserviceUrl, sharedFsUrl }: WebhookPanelProps) {
  // Gracefully enforce HTTPS on display for URLs that might have been saved as http://
  const forceHttps = (url?: string) => url ? url.replace(/^http:\/\/(.*\.vercel\.app.*|.*\.ngrok.*)/, 'https://$1') : '';

  const safeJiraUrl = forceHttps(jiraUrl);
  const safeFsUrl = forceHttps(freshserviceUrl);
  const safeSharedUrl = forceHttps(sharedFsUrl);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
      <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
        Webhook URLs
      </h3>
      <WebhookRow label="Jira Webhook" url={safeJiraUrl} accent="blue" />
      <WebhookRow label="Freshservice Webhook" url={safeFsUrl} accent="green" />
      {safeSharedUrl && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs font-medium text-amber-400">Shared FS Dispatcher</p>
          </div>
          <p className="text-[10px] text-[var(--muted)] pl-0.5">
            Add this single URL to your Freshservice Automation Rule. Tickets will be routed to this customer based on your routing key.
          </p>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-base)] border border-amber-500/20">
            <code className="text-[11px] font-mono text-[var(--muted)] flex-1 break-all leading-relaxed">
              {safeSharedUrl}
            </code>
            <CopyButton value={safeSharedUrl} />
          </div>
        </div>
      )}
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
