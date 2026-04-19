'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Customer } from '@/lib/types';
import { CustomerCard } from '@/components/customers/CustomerCard';
import { Modal } from '@/components/shared/Modal';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { toast } from '@/components/shared/Toast';
import { useRouter } from 'next/navigation';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const data = await api.listCustomers();
      setCustomers(data);
    } catch {
      toast('error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(slug: string) {
    try {
      const updated = await api.toggleCustomer(slug);
      setCustomers((prev) =>
        prev.map((c) => (c.slug === slug ? { ...c, isActive: updated.isActive } : c))
      );
      toast('success', `Customer ${updated.isActive ? 'enabled' : 'disabled'}`);
    } catch {
      toast('error', 'Failed to toggle customer');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCustomer(deleteTarget.slug);
      setCustomers((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      toast('success', `${deleteTarget.name} deleted successfully`);
      setDeleteTarget(null);
    } catch {
      toast('error', 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Customers</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {customers.length} tenant{customers.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <Link
          href="/dashboard/customers/new"
          id="new-customer-button"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#2563eb] text-white font-medium text-sm transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          New Customer
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)]/60 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <p className="text-[var(--muted)] text-sm mb-4">
            {search ? 'No customers match your search.' : 'No customers yet.'}
          </p>
          {!search && (
            <Link
              href="/dashboard/customers/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-sm border border-[var(--primary)]/20 hover:bg-[var(--primary)]/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add your first customer
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((customer) => (
            <CustomerCard
              key={customer._id}
              customer={customer}
              onToggle={handleToggle}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="Delete Customer"
        description={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.name}" and all their mappings. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Forever"
      />
    </div>
  );
}
