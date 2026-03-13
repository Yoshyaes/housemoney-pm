'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useUIStore } from '@/lib/stores/ui-store';
import { BRAND_AMBER } from '@/lib/constants';
import { X } from 'lucide-react';

interface ViewSaveDialogProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  currentFilters: unknown;
  currentSort: unknown;
}

export function ViewSaveDialog({ workspaceId, open, onClose, onSaved, currentFilters, currentSort }: ViewSaveDialogProps) {
  const { activeView, swimlaneMode } = useUIStore();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'PERSONAL' | 'WORKSPACE'>('PERSONAL');

  const saveView = trpc.views.save.useMutation({
    onSuccess: () => {
      setName('');
      onClose();
      onSaved();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Save view</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">View name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sarah's active work"
              className="w-full rounded border border-zinc-200 px-2.5 py-1.5 text-xs outline-none focus:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-600"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Visibility</label>
            <div className="flex gap-2">
              <button
                onClick={() => setScope('PERSONAL')}
                className={`rounded-full px-3 py-1 text-[11px] ${scope === 'PERSONAL' ? 'bg-amber-50 text-amber-700' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
              >
                Personal
              </button>
              <button
                onClick={() => setScope('WORKSPACE')}
                className={`rounded-full px-3 py-1 text-[11px] ${scope === 'WORKSPACE' ? 'bg-amber-50 text-amber-700' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
              >
                Workspace
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              saveView.mutate({
                workspaceId,
                name: name.trim(),
                scope,
                filters: currentFilters || [],
                sort: currentSort || [],
                swimlaneBy: swimlaneMode !== 'none' ? swimlaneMode : undefined,
                displayType: activeView,
              });
            }}
            disabled={!name.trim() || saveView.isPending}
            className="rounded px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND_AMBER }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
