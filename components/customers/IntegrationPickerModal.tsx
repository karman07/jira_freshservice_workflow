'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight, Zap } from 'lucide-react';

interface IntegrationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const integrations = [
  {
    id: 'jira',
    label: 'Jira ↔ Freshservice',
    shortLabel: 'Jira',
    description:
      'Bi-directional sync between a Jira project and a Freshservice instance. Tickets, comments, and status changes mirror in real-time.',
    href: '/dashboard/customers/new?mode=jira',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7" aria-hidden>
        <rect width="32" height="32" rx="6" fill="#0052CC" />
        <path
          d="M16.47 7.53a.6.6 0 0 0-.85 0L7.53 15.62a.6.6 0 0 0 0 .85l4.04 4.04 4.9-4.9a.6.6 0 0 1 .85 0l4.9 4.9 4.04-4.04a.6.6 0 0 0 0-.85L16.47 7.53Z"
          fill="white"
        />
        <path
          d="M16 17.04l-3.43 3.43 3 3a.6.6 0 0 0 .85 0l3-3L16 17.04Z"
          fill="white"
          opacity=".6"
        />
      </svg>
    ),
    accentColor: 'rgba(0,82,204,0.15)',
    borderColor: 'rgba(0,82,204,0.35)',
    hoverBorder: 'rgba(0,82,204,0.6)',
    tagColor: 'rgba(0,82,204,0.2)',
    tagText: '#60a5fa',
    tags: ['Tickets', 'Comments', 'Status Sync', 'Bi-directional'],
  },
  {
    id: 'freshservice',
    label: 'Freshservice Only',
    shortLabel: 'Freshservice',
    description:
      'Connect two Freshservice instances in a bi-directional FS↔FS sync. Ideal for partners sharing a support workflow without Jira.',
    href: '/dashboard/customers/new?mode=freshservice',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7" aria-hidden>
        <rect width="32" height="32" rx="6" fill="#22C55E" />
        <path
          d="M9 10a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V10Z"
          fill="white"
          opacity=".2"
        />
        <rect x="12" y="12" width="8" height="1.5" rx=".75" fill="white" />
        <rect x="12" y="15" width="6" height="1.5" rx=".75" fill="white" />
        <rect x="12" y="18" width="4" height="1.5" rx=".75" fill="white" />
        <circle cx="22" cy="22" r="5" fill="#16A34A" />
        <path d="M20 22h4M22 20v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    accentColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.30)',
    hoverBorder: 'rgba(34,197,94,0.55)',
    tagColor: 'rgba(34,197,94,0.15)',
    tagText: '#4ade80',
    tags: ['FS ↔ FS', 'Instance Pairing', 'Ticket Mirror', 'No Jira required'],
  },
];

export function IntegrationPickerModal({ isOpen, onClose }: IntegrationPickerModalProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
        style={{ animation: 'picker-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Choose Integration Type</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Select the platform you want to configure for this customer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-6">
          {integrations.map((int) => (
            <button
              key={int.id}
              id={`integration-picker-${int.id}`}
              onClick={() => handleSelect(int.href)}
              className="group text-left rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                background: int.accentColor,
                borderColor: int.borderColor,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = int.hoverBorder;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = int.borderColor;
              }}
            >
              {/* Icon + label */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0">{int.icon}</div>
                <span className="font-semibold text-[var(--text)] text-sm leading-tight">
                  {int.label}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs text-[var(--muted)] leading-relaxed mb-4">
                {int.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {int.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: int.tagColor, color: int.tagText }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <div
                className="flex items-center gap-1.5 text-xs font-semibold transition-all"
                style={{ color: int.tagText }}
              >
                Configure {int.shortLabel}
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes picker-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
