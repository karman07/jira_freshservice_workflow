'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { CreateCustomerPayload } from '@/lib/types';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { WebhookPanel } from '@/components/customers/WebhookPanel';
import { toast } from '@/components/shared/Toast';
import { PageLoader } from '@/components/shared/LoadingSpinner';

// Inner component that safely uses useSearchParams inside Suspense
function NewCustomerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as 'jira' | 'freshservice') ?? 'jira';

  const [slugError, setSlugError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ slug: string; jiraUrl: string; fsUrl: string } | null>(
    null
  );

  async function handleSubmit(data: CreateCustomerPayload) {
    setSlugError(undefined);
    const customer = await api.createCustomer(data).catch((err: Error) => {
      if (err.message?.toLowerCase().includes('slug') || err.message?.includes('409')) {
        setSlugError('This slug is already taken. Please choose another.');
      }
      throw err;
    });
    toast('success', 'Customer created successfully!');
    setCreated({
      slug: customer.slug,
      jiraUrl: customer.webhookJiraUrl,
      fsUrl: customer.webhookFreshserviceUrl,
    });
    setTimeout(() => {
      router.push(`/dashboard/customers/${customer.slug}`);
    }, 3000);
  }

  const isFreshserviceOnly = mode === 'freshservice';

  return (
    <div className="space-y-6 pb-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/customers"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--muted)]/50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            {isFreshserviceOnly ? 'New Freshservice Customer' : 'New Jira Customer'}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {isFreshserviceOnly
              ? 'Configure a Freshservice ↔ Freshservice sync tenant'
              : 'Configure a Jira ↔ Freshservice sync tenant'}
          </p>
        </div>

        {/* Mode badge */}
        <span
          className={`ml-auto flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${
            isFreshserviceOnly
              ? 'bg-green-500/10 text-green-400 border-green-500/25'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/25'
          }`}
        >
          {isFreshserviceOnly ? 'Freshservice Only' : 'Jira + Freshservice'}
        </span>
      </div>

      {/* Success banner with webhook URLs */}
      {created && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-5 space-y-4">
          <p className="text-sm font-medium text-green-400">
            ✅ Customer created successfully! Redirecting...
          </p>
          <WebhookPanel jiraUrl={created.jiraUrl} freshserviceUrl={created.fsUrl} />
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
        <CustomerForm
          onSubmit={handleSubmit}
          submitLabel="Create Customer"
          slugError={slugError}
          mode={mode}
        />
      </div>
    </div>
  );
}

export default function NewCustomerPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewCustomerContent />
    </Suspense>
  );
}
