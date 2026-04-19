'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

interface DangerZoneProps {
  customerName: string;
  onDelete: () => Promise<void>;
}

export function DangerZone({ customerName, onDelete }: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onDelete();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
            Danger Zone
          </h3>
        </div>
        <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
          Permanently delete this customer and all their sync history, mappings, and
          configuration. This action cannot be undone.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all duration-200"
        >
          <Trash2 className="w-4 h-4" />
          Delete Customer
        </button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        isLoading={loading}
        title="Delete Customer"
        description={`This will permanently delete "${customerName}" and all their mappings. This cannot be undone.`}
        confirmLabel="Delete Forever"
      />
    </>
  );
}
