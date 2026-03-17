'use client';

import { Plus } from 'lucide-react';
import { BRAND_AMBER } from '@/lib/constants';
import { useDecisionsStore } from '@/lib/stores/decisions-store';

interface DecisionsTopbarProps {
  isGuest?: boolean;
}

export function DecisionsTopbar({ isGuest }: DecisionsTopbarProps) {
  const { setCreateModalOpen } = useDecisionsStore();

  return (
    <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-5 py-3">
      <div>
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Decision Register</h1>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Track and reference key decisions across the organization
        </p>
      </div>
      {!isGuest && (
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Decision
        </button>
      )}
    </div>
  );
}
