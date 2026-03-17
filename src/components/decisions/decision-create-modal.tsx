'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDecisionsStore } from '@/lib/stores/decisions-store';
import { Avatar } from '@/components/shared/avatar';
import { BRAND_AMBER, DECISION_STATUS_LABELS } from '@/lib/constants';
import type { DecisionStatus } from '@/generated/prisma/client';

interface DecisionCreateModalProps {
  workspaceId: string;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
  projects: Array<{ id: string; name: string; color: string }>;
  currentUserId: string;
}

const STATUS_OPTIONS: DecisionStatus[] = ['DRAFT', 'ACTIVE'];

export function DecisionCreateModal({ workspaceId, members, projects, currentUserId }: DecisionCreateModalProps) {
  const { createModalOpen, setCreateModalOpen } = useDecisionsStore();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<DecisionStatus>('DRAFT');
  const [category, setCategory] = useState('');
  const [decisionDate, setDecisionDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [supersedesSelection, setSupersedesSelection] = useState<Array<{ id: string; title: string }>>([]);
  const [supersedesSearch, setSupersedesSearch] = useState('');
  const [debouncedSupersedesSearch, setDebouncedSupersedesSearch] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce supersedes search (300ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSupersedesSearch(supersedesSearch);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [supersedesSearch]);

  const { data: categories = [] } = trpc.decisions.listCategories.useQuery(
    { workspaceId },
    { enabled: !!workspaceId && createModalOpen }
  );

  const { data: existingDecisions } = trpc.decisions.list.useQuery(
    { workspaceId, status: 'ACTIVE', search: debouncedSupersedesSearch || undefined, limit: 10 },
    { enabled: !!workspaceId && createModalOpen && debouncedSupersedesSearch.length > 0 }
  );

  const createDecision = trpc.decisions.create.useMutation({
    onSuccess: () => {
      utils.decisions.list.invalidate();
      utils.decisions.listCategories.invalidate({ workspaceId });
      resetForm();
      setCreateModalOpen(false);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setBody('');
    setStatus('DRAFT');
    setCategory('');
    setDecisionDate(new Date().toISOString().split('T')[0]);
    setProjectId('');
    setParticipantIds([]);
    setSupersedesSelection([]);
    setSupersedesSearch('');
    setDebouncedSupersedesSearch('');
    setMutationError(null);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    setMutationError(null);
    // Parse date as local to avoid timezone shift
    const [y, m, d] = decisionDate.split('-').map(Number);
    createDecision.mutate({
      workspaceId,
      title: title.trim(),
      body,
      status,
      category: category.trim() || undefined,
      decisionDate: new Date(y, m - 1, d, 12),
      projectId: projectId || undefined,
      participantIds,
      supersedesIds: supersedesSelection.map((s) => s.id),
    });
  };

  if (!createModalOpen) return null;

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleSupersedes = (id: string, decisionTitle: string) => {
    setSupersedesSelection((prev) => {
      const exists = prev.some((s) => s.id === id);
      if (exists) return prev.filter((s) => s.id !== id);
      return [...prev, { id, title: decisionTitle }];
    });
  };

  const removeSupersedes = (id: string) => {
    setSupersedesSelection((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={() => { setCreateModalOpen(false); resetForm(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Create new decision"
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg rounded-t-lg md:rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Decision</h3>
          <button
            onClick={() => { setCreateModalOpen(false); resetForm(); }}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner */}
        {mutationError && (
          <div className="flex items-center gap-2 border-b border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-4 py-2 text-[11px] text-red-700 dark:text-red-400">
            <span className="flex-1">{mutationError}</span>
            <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Title *
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="What was decided?"
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              aria-required="true"
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Rationale
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Why was this decision made? What alternatives were considered?"
              rows={3}
              className="w-full resize-none rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
          </div>

          {/* Row: Status + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DecisionStatus)}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{DECISION_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Decision date
              </label>
              <input
                type="date"
                value={decisionDate}
                onChange={(e) => setDecisionDate(e.target.value)}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
              />
            </div>
          </div>

          {/* Row: Category + Project */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Category
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="decision-categories"
                placeholder="e.g. Architecture, Hiring"
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
              <datalist id="decision-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Participants
            </label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const isSelected = participantIds.includes(m.id) || m.id === currentUserId;
                const isCreator = m.id === currentUserId;
                return (
                  <button
                    key={m.id}
                    onClick={() => !isCreator && toggleParticipant(m.id)}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] transition-colors border ${
                      isSelected
                        ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    } ${isCreator ? 'cursor-default' : 'cursor-pointer'}`}
                    aria-pressed={isSelected}
                  >
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor ?? undefined} size="xs" />
                    {m.name.split(' ')[0]}
                    {isCreator && <span className="text-[9px] opacity-50">(you)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supersedes */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Supersedes (optional)
            </label>
            <input
              value={supersedesSearch}
              onChange={(e) => setSupersedesSearch(e.target.value)}
              placeholder="Search active decisions to supersede..."
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
            {existingDecisions && existingDecisions.items.length > 0 && (
              <div className="mt-1 max-h-28 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1">
                {existingDecisions.items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleSupersedes(d.id, d.title)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      supersedesSelection.some((s) => s.id === d.id)
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {d.title}
                  </button>
                ))}
              </div>
            )}
            {supersedesSelection.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {supersedesSelection.map((sel) => (
                  <span
                    key={sel.id}
                    className="flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                  >
                    {sel.title}
                    <button onClick={() => removeSupersedes(sel.id)} className="hover:text-red-500">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
          <button
            onClick={() => { setCreateModalOpen(false); resetForm(); }}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || createDecision.isPending}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_AMBER }}
          >
            {createDecision.isPending ? 'Creating...' : 'Create Decision'}
          </button>
        </div>
      </div>
    </div>
  );
}
