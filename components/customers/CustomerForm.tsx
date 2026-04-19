'use client';

import { useState, useEffect } from 'react';
import type { Customer, CreateCustomerPayload } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { Eye, EyeOff, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface CustomerFormProps {
  initialData?: Customer;
  onSubmit: (data: CreateCustomerPayload) => Promise<void>;
  submitLabel?: string;
  slugError?: string;
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
}: CustomerFormProps) {
  const [loading, setLoading] = useState(false);
  const [fsExpanded, setFsExpanded] = useState(false);

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

  // Freshservice
  const [fsBaseUrl, setFsBaseUrl] = useState(initialData?.freshserviceBaseUrl ?? '');
  const [fsApiKey, setFsApiKey] = useState(initialData?.freshserviceApiKey ?? '');
  const [fsCustomStatus, setFsCustomStatus] = useState(initialData?.fsCustomStatusAwaiting ?? '');
  const [fallbackEmail, setFallbackEmail] = useState(initialData?.fallbackEmail ?? '');

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
    if (!jiraBaseUrl.trim()) e.jiraBaseUrl = 'Jira Base URL is required';
    if (!jiraEmail.trim()) e.jiraEmail = 'Jira Email is required';
    if (!jiraApiToken.trim()) e.jiraApiToken = 'Jira API Token is required';
    if (!jiraProjectKey.trim()) e.jiraProjectKey = 'Jira Project Key is required';
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

      {/* ── Jira ── */}
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

      {/* ── Freshservice (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setFsExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-4 pb-2 border-b border-[var(--border)] w-full hover:text-[var(--text)] transition-colors"
        >
          {fsExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Freshservice Configuration
          <span className="ml-1 text-[var(--muted)] text-[10px] normal-case font-normal">
            Optional
          </span>
        </button>

        {fsExpanded && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-300 leading-relaxed">
                If left blank, the system will use the global default Freshservice
                credentials configured in the server environment.
              </p>
            </div>
            <Field label="Freshservice Base URL">
              <input
                type="url"
                value={fsBaseUrl}
                onChange={(e) => setFsBaseUrl(e.target.value)}
                placeholder="https://company.freshservice.com"
                className={inputCls('fsBaseUrl')}
              />
            </Field>
            <Field label="Freshservice API Key">
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
