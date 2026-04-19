'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Zap,
  LayoutDashboard,
  Users,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  ExternalLink,
  BarChart2,
  Moon,
  Sun,
  BookOpen,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { removeToken, getEmail } from '@/lib/auth';
import { api } from '@/lib/api';
import type { Customer } from '@/lib/types';

const PAGE_SIZE = 4;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [email, setEmail] = useState<string>('');
  const [customersOpen, setCustomersOpen] = useState(true);
  const [page, setPage] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmail(getEmail() ?? 'admin@intell.io');
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  // Reset to page 0 if customer list shrinks
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(customers.length / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [customers.length, page]);

  function handleLogout() {
    removeToken();
    router.push('/login');
  }

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/');

  const totalPages = Math.ceil(customers.length / PAGE_SIZE);
  const paginated = customers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <aside className="flex flex-col w-64 h-full bg-[var(--bg-surface)] border-r border-[var(--border)] flex-shrink-0">

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--primary)] flex-shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <span className="block text-base font-bold text-[var(--text)] tracking-tight leading-tight">
            Intellinum Webhooks
          </span>
          <span className="block text-[11px] text-[var(--muted)] leading-tight">
            Admin
          </span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">

        {/* Dashboard */}
        <NavItem
          href="/dashboard"
          label="Dashboard"
          icon={<LayoutDashboard className="w-4 h-4" />}
          active={pathname === '/dashboard'}
        />

        {/* Documentation */}
        <NavItem
          href="/dashboard/docs"
          label="Documentation"
          icon={<BookOpen className="w-4 h-4" />}
          active={pathname === '/dashboard/docs'}
        />

        {/* ── Customers section ── */}
        <div>
          {/* Section header button */}
          <button
            onClick={() => setCustomersOpen((o) => !o)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive('/dashboard/customers')
                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">Customers</span>
            {customers.length > 0 && (
              <span className="text-[10px] font-mono tabular-nums bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--muted)] rounded-md px-1.5 py-0.5">
                {customers.length}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0 ${
                customersOpen ? '' : '-rotate-90'
              }`}
            />
          </button>

          {customersOpen && (
            <div className="mt-1 ml-1 space-y-0.5">

              {/* "All Customers" link */}
              <Link
                href="/dashboard/customers"
                className={`flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                  pathname === '/dashboard/customers'
                    ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <Users className="w-3 h-3 flex-shrink-0" />
                <span>All Customers</span>
              </Link>

              {/* Paginated customer list */}
              {paginated.map((c) => {
                const isOnCustomer =
                  pathname === `/dashboard/customers/${c.slug}` ||
                  pathname === `/dashboard/customers/${c.slug}/analytics`;

                return (
                  <div
                    key={c._id}
                    className={`rounded-lg transition-all duration-150 ${
                      isOnCustomer ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]/50'
                    }`}
                  >
                    {/* Customer name row */}
                    <div className="flex items-center gap-2 pl-8 pr-2 py-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          c.isActive ? 'bg-green-400' : 'bg-[var(--muted)]'
                        }`}
                      />
                      <span
                        className={`text-[13px] truncate flex-1 min-w-0 ${
                          isOnCustomer ? 'text-[var(--text)]' : 'text-[var(--muted)]'
                        }`}
                        title={c.name}
                      >
                        {c.name}
                      </span>
                    </div>

                    {/* View / Analytics sub-links */}
                    <div className="flex items-center gap-1 pl-10 pr-2 pb-1.5">
                      <Link
                        href={`/dashboard/customers/${c.slug}`}
                        title={`View ${c.name}`}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                          pathname === `/dashboard/customers/${c.slug}`
                            ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                            : 'text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5'
                        }`}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        View
                      </Link>
                      <span className="text-[var(--border)]">|</span>
                      <Link
                        href={`/dashboard/customers/${c.slug}/analytics`}
                        title={`Analytics for ${c.name}`}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                          pathname === `/dashboard/customers/${c.slug}/analytics`
                            ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                            : 'text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5'
                        }`}
                      >
                        <BarChart2 className="w-2.5 h-2.5" />
                        Analytics
                      </Link>
                    </div>
                  </div>
                );
              })}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pl-8 pr-2 py-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Prev
                  </button>
                  <span className="text-[10px] text-[var(--muted)] tabular-nums">
                    {page + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* New customer */}
              <Link
                href="/dashboard/customers/new"
                className={`flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                  pathname === '/dashboard/customers/new'
                    ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <Plus className="w-3 h-3 flex-shrink-0" />
                <span>New Customer</span>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* ── User footer ── */}
      <div className="border-t border-[var(--border)] p-3 space-y-1">
        {/* User pill */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-elevated)]/60">
          <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--muted)] truncate">{email}</p>
            <p className="text-[10px] text-[var(--muted)]/60">Administrator</p>
          </div>
        </div>

        {/* Theme Toggle & Logout */}
        <div className="flex gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
            title="Toggle theme"
          >
            {mounted && (theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />)}
          </button>
          <button
            onClick={handleLogout}
            className="flex-[2] flex items-center justify-center gap-2.5 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
