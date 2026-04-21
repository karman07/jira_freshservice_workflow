'use client';

import { useState, useEffect } from 'react';
import type { Customer, CreateCustomerPayload } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { Eye, EyeOff, ChevronDown, ChevronRight, Info, ArrowLeftRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface CustomerFormProps {
  initialData?: Customer;
  onSubmit: (data: CreateCustomerPayload) => Promise<void>;
  submitLabel?: string;
  slugError?: string;
  /** 'jira' = Jira+FS sync (default); 'freshservice' = FS-only / FS↔FS */
  mode?: 'jira' | 'freshservice';
}

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}

function Field({ label, required, children, error, hint }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm font-medium text-[var(--text)]">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)]/60 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all font-mono"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function CustomerForm({
  initialData,
  onSubmit,
  submitLabel = 'Save',
  slugError,
  mode = 'jira',
}: CustomerFormProps) {
  const isFsOnly = mode === 'freshservice';
  const [loading, setLoading] = useState(false);
  const [fsExpanded, setFsExpanded] = useState(false);
  const [fsPairExpanded, setFsPairExpanded] = useState(
    !!(initialData?.fsPairEnabled || initialData?.fs2BaseUrl)
  );

  // Basic info
  const [name, setName] = useState(initialData?.name ?? '');
  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [slugManual, setSlugManual] = useState(!!initialData?.slug);

  // Jira
  const [jiraBaseUrl, setJiraBaseUrl] = useState(initialData?.jiraBaseUrl ?? '');
  const [jiraEmail, setJiraEmail] = useState(initialData?.jiraEmail ?? '');
  const [jiraApiToken, setJiraApiToken] = useState(initialData?.jiraApiToken ?? '');
  const [jiraProjectKey, setJiraProjectKey] = useState(initialData?.jiraProjectKey ?? '');

  // Freshservice Instance A
  const [fsBaseUrl, setFsBaseUrl] = useState(initialData?.freshserviceBaseUrl ?? '');
  const [fsApiKey, setFsApiKey] = useState(initialData?.freshserviceApiKey ?? '');
  const [fsCustomStatus, setFsCustomStatus] = useState(initialData?.fsCustomStatusAwaiting ?? '');
  const [fallbackEmail, setFallbackEmail] = useState(initialData?.fallbackEmail ?? '');

  // Freshservice Instance B (FS pairing)
  const [fsPairEnabled, setFsPairEnabled] = useState(initialData?.fsPairEnabled ?? false);
  const [fs2BaseUrl, setFs2BaseUrl] = useState(initialData?.fs2BaseUrl ?? '');
  const [fs2ApiKey, setFs2ApiKey] = useState(initialData?.fs2ApiKey ?? '');
  const [fs2FallbackEmail, setFs2FallbackEmail] = useState(initialData?.fs2FallbackEmail ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slugManual && name) {
      setSlug(slugify(name));
    }
  }, [name, slugManual]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!slug.trim()) e.slug = 'Slug is required';
    if (!/^[a-z0-9-]+$/.test(slug)) e.slug = 'Only lowercase letters, numbers, and hyphens';
    if (!isFsOnly) {
      if (!jiraBaseUrl.trim()) e.jiraBaseUrl = 'Jira Base URL is required';
      if (!jiraEmail.trim()) e.jiraEmail = 'Jira Email is required';
      if (!jiraApiToken.trim()) e.jiraApiToken = 'Jira API Token is required';
      if (!jiraProjectKey.trim()) e.jiraProjectKey = 'Jira Project Key is required';
    } else {
      if (!fsBaseUrl.trim()) e.fsBaseUrl = 'Freshservice Base URL is required';
      if (!fsApiKey.trim()) e.fsApiKey = 'Freshservice API Key is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        name,
        slug,
        description: description || undefined,
        jiraBaseUrl,
        jiraEmail,
        jiraApiToken,
        jiraProjectKey,
        freshserviceBaseUrl: fsBaseUrl || undefined,
        freshserviceApiKey: fsApiKey || undefined,
        fsCustomStatusAwaiting: fsCustomStatus || undefined,
        fallbackEmail: fallbackEmail || undefined,
        // FS Instance B
        fsPairEnabled,
        fs2BaseUrl: fs2BaseUrl || undefined,
        fs2ApiKey: fs2ApiKey || undefined,
        fs2FallbackEmail: fs2FallbackEmail || undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (key: string) =>
    `w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-elevated)] border text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)]/60 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all ${
      errors[key] ? 'border-red-500/50' : 'border-[var(--border)]'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── Basic Info ── */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4 pb-2 border-b border-[var(--border)]">
          Basic Information
        </h3>
        <div className="space-y-4">
          <Field label="Customer Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugManual) setSlug(slugify(e.target.value));
              }}
              placeholder="Acme Corp"
              className={inputCls('name')}
            />
          </Field>

          <Field
            label="Slug"
            required
            error={slugError || errors.slug}
            hint="URL-safe identifier (auto-generated from name)"
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              placeholder="acme-corp"
              className={`${inputCls('slug')} font-mono`}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this customer..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)]/60 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all resize-none"
            />
          </Field>
        </div>
      </section>

      {/* ── Jira (hidden in freshservice-only mode) ── */}
      {!isFsOnly && (
      <section>
        <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4 pb-2 border-b border-[var(--border)]">
          Jira Configuration
          <span className="ml-2 text-red-400 text-[10px] normal-case">Required</span>
        </h3>
        <div className="space-y-4">
          <Field label="Jira Base URL" required error={errors.jiraBaseUrl}>
            <input
              type="url"
              value={jiraBaseUrl}
              onChange={(e) => setJiraBaseUrl(e.target.value)}
              placeholder="https://company.atlassian.net"
              className={inputCls('jiraBaseUrl')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Jira Email" required error={errors.jiraEmail}>
              <input
                type="email"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
                placeholder="admin@acme.com"
                className={inputCls('jiraEmail')}
              />
            </Field>
            <Field label="Project Key" required error={errors.jiraProjectKey}>
              <input
                type="text"
                value={jiraProjectKey}
                onChange={(e) => setJiraProjectKey(e.target.value.toUpperCase())}
                placeholder="ACME"
                className={`${inputCls('jiraProjectKey')} font-mono uppercase`}
              />
            </Field>
          </div>
          <Field label="Jira API Token" required error={errors.jiraApiToken}>
            <SecretInput
              value={jiraApiToken}
              onChange={setJiraApiToken}
              placeholder="ATATT..."
            />
          </Field>
        </div>
      </section>
      )}

      {/* ── Freshservice Instance A ── */}
      {/* In freshservice-only mode this section is promoted as Required; in jira mode it's collapsible/optional */}
      <section>
        <button
          type="button"
          onClick={() => !isFsOnly && setFsExpanded((v) => !v)}
          className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-4 pb-2 border-b border-[var(--border)] w-full transition-colors ${
            isFsOnly
              ? 'text-[var(--text)] cursor-default'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          {!isFsOnly && (
            (fsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            ))
          )}
          Freshservice Instance A — Primary
          {isFsOnly ? (
            <span className="ml-2 text-red-400 text-[10px] normal-case">Required</span>
          ) : (
            <span className="ml-1 text-[var(--muted)] text-[10px] normal-case font-normal">
              Optional (uses global env defaults)
            </span>
          )}
        </button>

        {(isFsOnly || fsExpanded) && (
          <div className="space-y-4">
            {!isFsOnly && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300 leading-relaxed">
                  If left blank, the system will use the global default Freshservice
                  credentials configured in the server environment.
                </p>
              </div>
            )}
            <Field label="Freshservice Base URL" required={isFsOnly} error={errors.fsBaseUrl}>
              <input
                type="url"
                value={fsBaseUrl}
                onChange={(e) => setFsBaseUrl(e.target.value)}
                placeholder="https://company.freshservice.com"
                className={inputCls('fsBaseUrl')}
              />
            </Field>
            <Field label="Freshservice API Key" required={isFsOnly} error={errors.fsApiKey}>
              <SecretInput value={fsApiKey} onChange={setFsApiKey} placeholder="API Key..." />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Custom Status Field">
                <input
                  type="text"
                  value={fsCustomStatus}
                  onChange={(e) => setFsCustomStatus(e.target.value)}
                  placeholder="Confirm Resolution"
                  className={inputCls('fsCustomStatus')}
                />
              </Field>
              <Field label="Fallback Requester Email">
                <input
                  type="email"
                  value={fallbackEmail}
                  onChange={(e) => setFallbackEmail(e.target.value)}
                  placeholder="fallback@company.com"
                  className={inputCls('fallbackEmail')}
                />
              </Field>
            </div>
          </div>
        )}
      </section>

      {/* ── Freshservice Instance B (FS Pairing) ── */}
      <section>
        <button
          type="button"
          onClick={() => setFsPairExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4 pb-2 border-b border-[var(--border)] w-full hover:text-[var(--text)] transition-colors"
        >
          {fsPairExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Freshservice Pairing — Instance B
          <span className="ml-1 text-[var(--muted)] text-[10px] normal-case font-normal">
            {fsPairEnabled ? (
              <span className="text-green-400 font-semibold">Enabled</span>
            ) : 'Optional'}
          </span>
        </button>

        {fsPairExpanded && (
          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Enable FS ↔ FS Bi-directional Sync</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  When on, tickets created in either instance are automatically mirrored to the other.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFsPairEnabled((v) => !v)}
                className="flex-shrink-0 transition-colors"
                aria-label="Toggle FS pair sync"
              >
                {fsPairEnabled ? (
                  <ToggleRight className="w-8 h-8 text-green-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                )}
              </button>
            </div>

            {fsPairEnabled && (
              <>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <ArrowLeftRight className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-purple-300 leading-relaxed">
                    Configure the second Freshservice instance. After saving, two webhook URLs
                    will appear in the FS ↔ FS Pairing panel — add each to the corresponding
                    Freshservice Automation Rule.
                  </p>
                </div>

                <Field label="Instance B Base URL" required error={errors.fs2BaseUrl}
                  hint="e.g. https://partner.freshservice.com">
                  <input
                    type="url"
                    value={fs2BaseUrl}
                    onChange={(e) => setFs2BaseUrl(e.target.value)}
                    placeholder="https://partner.freshservice.com"
                    className={inputCls('fs2BaseUrl')}
                  />
                </Field>

                <Field label="Instance B API Key" required error={errors.fs2ApiKey}>
                  <SecretInput
                    value={fs2ApiKey}
                    onChange={setFs2ApiKey}
                    placeholder="Instance B API key..."
                    id="fs2ApiKey"
                  />
                </Field>

                <Field
                  label="Instance B Fallback Email"
                  hint="Used as the requester when creating mirror tickets in Instance B"
                >
                  <input
                    type="email"
                    value={fs2FallbackEmail}
                    onChange={(e) => setFs2FallbackEmail(e.target.value)}
                    placeholder="support@partner.com"
                    className={inputCls('fs2FallbackEmail')}
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </section>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] hover:bg-[#2563eb] text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" />
            Processing...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
