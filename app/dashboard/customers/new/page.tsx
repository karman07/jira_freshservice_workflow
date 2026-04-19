'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { CreateCustomerPayload } from '@/lib/types';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { WebhookPanel } from '@/components/customers/WebhookPanel';
import { toast } from '@/components/shared/Toast';

export default function NewCustomerPage() {
  const router = useRouter();
  const [slugError, setSlugError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ slug: string; jiraUrl: string; fsUrl: string } | null>(null);

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
          <h1 className="text-2xl font-bold text-[var(--text)]">New Customer</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Create a new sync tenant configuration
          </p>
        </div>
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
        />
      </div>
    </div>
  );
}
