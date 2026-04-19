'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

function getBreadcrumbs(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let path = '';
  for (const part of parts) {
    path += '/' + part;
    const label = part
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: path });
  }
  return crumbs;
}

export function TopBar() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex items-center h-14 px-6 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-sm flex-shrink-0">
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)]" />}
            {i === crumbs.length - 1 ? (
              <span className="text-[var(--text)] font-medium">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
