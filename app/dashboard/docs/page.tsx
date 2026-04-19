'use client';

import { BookOpen, ExternalLink, Zap, Key } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12 animate-fade-in">
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-3xl font-bold text-[var(--text)] tracking-tight">Platform Integration</h1>
        </div>
        <p className="text-[var(--muted)]">
          Follow these guides to obtain credentials and configure synchronization between your platforms.
        </p>
      </div>

      {/* Jira Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10">
            <ExternalLink className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)]">Jira Configuration</h2>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* API Key Guide */}
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text)] flex items-center gap-2 mb-4">
              <Key className="w-4 h-4 text-amber-500" />
              How to get Jira API Token
            </h3>
            <ol className="text-sm text-[var(--muted)] space-y-3 list-decimal ml-5">
              <li>Log in to your Atlassian account at <b className="text-[var(--text)]">id.atlassian.com</b>.</li>
              <li>Go to <b className="text-[var(--text)]">Security {'>'} API tokens</b>.</li>
              <li>Click <b className="text-[var(--text)]">Create API token</b>.</li>
              <li>Enter a label for your token (e.g., "Intellinum Sync") and click <b className="text-[var(--text)]">Create</b>.</li>
              <li>Copy the token immediately. You will need to use this along with your email in the Customer configuration.</li>
            </ol>
          </div>

          {/* Webhook Guide */}
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text)] mb-4">Setting up Jira Webhook</h3>
            <ol className="text-sm text-[var(--muted)] space-y-3 list-decimal ml-5">
              <li>Navigate to <b className="text-[var(--text)]">Jira Settings {'>'} System {'>'} Webhooks</b>.</li>
              <li>Click <b className="text-[var(--text)]">Create a Webhook</b>.</li>
              <li>Paste your unique <b className="text-[var(--text)]">Jira Webhook URL</b> from the customer management page.</li>
              <li>Select events: <b className="text-[var(--text)]">Issue Related Events</b> (Created, Updated, Deleted and Comment Created).</li>
              <li>Scroll to the bottom and click <b className="text-[var(--text)]">Create</b>.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Freshservice Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-500/10">
            <Zap className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)]">Freshservice Configuration</h2>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* API Key Guide */}
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text)] flex items-center gap-2 mb-4">
              <Key className="w-4 h-4 text-amber-500" />
              How to get Freshservice API Key
            </h3>
            <ol className="text-sm text-[var(--muted)] space-y-3 list-decimal ml-5">
              <li>Log in to your Freshservice portal.</li>
              <li>Click on your <b className="text-[var(--text)]">Profile Picture</b> in the top right corner.</li>
              <li>Select <b className="text-[var(--text)]">Profile Settings</b>.</li>
              <li>On the right side of the page, you will see a badge that says <b className="text-[var(--text)]">Your API Key</b>.</li>
              <li>Complete the captcha to reveal the key and copy it.</li>
            </ol>
          </div>

          {/* Webhook Guide */}
          <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text)] mb-4">Setting up Freshservice Webhooks</h3>
            <p className="text-sm text-[var(--muted)] mb-4">
              You must create <strong>three different workflows</strong> in Freshservice (<b className="text-[var(--text)]">Admin {'>'} Workflow Automator</b>) to ensure full bi-directional sync. For all three workflows, use <strong>Action: Trigger Webhook</strong>, Method: <strong>POST</strong>, and paste your unique <strong>Freshservice Webhook URL</strong>. Ensure the Encoded Format is <strong>JSON</strong>.
            </p>
            
            <div className="space-y-4">
              {/* Workflow 1 */}
              <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                <h4 className="font-medium text-[var(--text)] mb-2">1. Ticket Creation Sync</h4>
                <ul className="text-sm text-[var(--muted)] list-disc ml-4 space-y-1">
                  <li><strong>Event:</strong> Ticket is raised</li>
                  <li><strong>Condition:</strong> Set any conditions if you only want specific tickets synced, otherwise leave blank.</li>
                  <li><strong>Action:</strong> Trigger Webhook (Configure as described above)</li>
                </ul>
              </div>

              {/* Workflow 2 */}
              <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                <h4 className="font-medium text-[var(--text)] mb-2">2. Ticket Update Sync</h4>
                <ul className="text-sm text-[var(--muted)] list-disc ml-4 space-y-1">
                  <li><strong>Event:</strong> Ticket is updated</li>
                  <li><strong>Condition:</strong> Trigger when standard properties (Status, Priority, Group, Agent) are changed.</li>
                  <li><strong>Action:</strong> Trigger Webhook (Configure as described above)</li>
                </ul>
              </div>

              {/* Workflow 3 */}
              <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                <h4 className="font-medium text-[var(--text)] mb-2">3. Attachment Sync</h4>
                <ul className="text-sm text-[var(--muted)] list-disc ml-4 space-y-1">
                  <li><strong>Event:</strong> Attachment is added</li>
                  <li><strong>Condition:</strong> Trigger when a file is uploaded to the ticket or a note.</li>
                  <li><strong>Action:</strong> Trigger Webhook (Configure as described above)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Note */}
      <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-sm flex items-start gap-4">
        <Key className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[var(--muted)] leading-relaxed">
          <span className="font-bold text-[var(--text)]">Security Note:</span> Always keep your API keys and tokens secure. Never share them in public repositories or unauthorized channels.
        </p>
      </div>
    </div>
  );
}
