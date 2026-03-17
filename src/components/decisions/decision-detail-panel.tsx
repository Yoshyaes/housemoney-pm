'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Pencil, Trash2, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDecisionsStore } from '@/lib/stores/decisions-store';
import { DecisionStatusBadge } from './decision-status-badge';
import { Avatar } from '@/components/shared/avatar';
import { DECISION_STATUS_LABELS, BRAND_AMBER } from '@/lib/constants';
import type { DecisionStatus } from '@/generated/prisma/client';

interface DecisionDetailPanelProps {
  workspaceId: string;
  currentUserId: string | null;
  isAdmin?: boolean;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
}

const STATUS_OPTIONS: DecisionStatus[] = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED'];

export function DecisionDetailPanel({ workspaceId, currentUserId, isAdmin, members }: DecisionDetailPanelProps) {
  const { selectedDecisionId, setSelectedDecisionId } = useDecisionsStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const [categoryValue, setCategoryValue] = useState('');
  const [bodyValue, setBodyValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const statusRef = useRef<HTMLDivElement>(null);
  const participantRef = useRef<HTMLDivElement>(null);
  const categoryTimer = useRef<ReturnType<typeof setTimeout>>();
  const bodyTimer = useRef<ReturnType<typeof setTimeout>>();

  const utils = trpc.useUtils();

  const { data: decision, isLoading } = trpc.decisions.get.useQuery(
    { id: selectedDecisionId! },
    { enabled: !!selectedDecisionId }
  );

  // Sync local state when decision data changes
  useEffect(() => {
    if (decision) {
      setCategoryValue(decision.category ?? '');
      setBodyValue(decision.body);
    }
  }, [decision]);

  const updateDecision = trpc.decisions.update.useMutation({
    onSuccess: () => {
      utils.decisions.get.invalidate({ id: selectedDecisionId! });
      utils.decisions.list.invalidate();
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const deleteDecision = trpc.decisions.delete.useMutation({
    onSuccess: () => {
      setSelectedDecisionId(null);
      utils.decisions.list.invalidate();
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  // Click-outside handlers for dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
      if (participantOpen && participantRef.current && !participantRef.current.contains(e.target as Node)) {
        setParticipantOpen(false);
      }
    };
    if (statusOpen || participantOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpen, participantOpen]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (categoryTimer.current) clearTimeout(categoryTimer.current);
      if (bodyTimer.current) clearTimeout(bodyTimer.current);
    };
  }, []);

  if (!selectedDecisionId) return null;

  const canEdit = decision && (decision.createdById === currentUserId || isAdmin);

  const handleStatusChange = (status: DecisionStatus) => {
    updateDecision.mutate({ id: selectedDecisionId, status });
    setStatusOpen(false);
  };

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue !== decision?.title) {
      updateDecision.mutate({ id: selectedDecisionId, title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleCategoryChange = (value: string) => {
    setCategoryValue(value);
    if (categoryTimer.current) clearTimeout(categoryTimer.current);
    categoryTimer.current = setTimeout(() => {
      updateDecision.mutate({ id: selectedDecisionId, category: value || null });
    }, 500);
  };

  const handleBodyChange = (value: string) => {
    setBodyValue(value);
    if (bodyTimer.current) clearTimeout(bodyTimer.current);
    bodyTimer.current = setTimeout(() => {
      updateDecision.mutate({ id: selectedDecisionId, body: value });
    }, 500);
  };

  const handleDateChange = (value: string) => {
    if (value) {
      // Parse as local date to avoid timezone shift
      const [y, m, d] = value.split('-').map(Number);
      updateDecision.mutate({ id: selectedDecisionId, decisionDate: new Date(y, m - 1, d, 12) });
    }
  };

  const handleAddParticipant = (userId: string) => {
    if (!decision) return;
    const currentIds = decision.participants.map((p) => p.user.id);
    if (!currentIds.includes(userId)) {
      updateDecision.mutate({ id: selectedDecisionId, participantIds: [...currentIds, userId] });
    }
    setParticipantOpen(false);
  };

  const handleRemoveParticipant = (userId: string) => {
    if (!decision) return;
    if (userId === decision.createdById) return;
    const currentIds = decision.participants.map((p) => p.user.id).filter((id) => id !== userId);
    updateDecision.mutate({ id: selectedDecisionId, participantIds: currentIds });
  };

  const handleDelete = () => {
    deleteDecision.mutate({ id: selectedDecisionId });
    setDeleteConfirmOpen(false);
  };

  // Format date as YYYY-MM-DD in local timezone
  const formatDateLocal = (date: Date | string) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const availableParticipants = decision
    ? members.filter((m) => !decision.participants.some((p) => p.user.id === m.id))
    : [];

  return (
    <div
      className="flex h-full w-[380px] min-w-[380px] flex-col border-l border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      role="complementary"
      aria-label="Decision detail"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Decision detail
        </span>
        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <button
                onClick={() => {
                  setEditingTitle(true);
                  setTitleValue(decision?.title ?? '');
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title="Edit title"
                aria-label="Edit title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                title="Delete decision"
                aria-label="Delete decision"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setSelectedDecisionId(null)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {mutationError && (
        <div className="flex items-center gap-2 border-b border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-4 py-2 text-[11px] text-red-700 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{mutationError}</span>
          <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
      ) : !decision ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Decision not found</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Title */}
          <div className="px-4 pt-4 pb-2">
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none"
                aria-label="Decision title"
              />
            ) : (
              <h2
                className={`text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${
                  decision.status === 'SUPERSEDED' ? 'line-through opacity-60' : ''
                }`}
              >
                {decision.title}
              </h2>
            )}
          </div>

          {/* Meta fields */}
          <div className="space-y-3 px-4 py-3">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Status</span>
              <div className="relative" ref={statusRef}>
                <button
                  onClick={() => canEdit && setStatusOpen(!statusOpen)}
                  className={canEdit ? 'cursor-pointer' : 'cursor-default'}
                  aria-haspopup="listbox"
                  aria-expanded={statusOpen}
                >
                  <DecisionStatusBadge status={decision.status} />
                </button>
                {statusOpen && canEdit && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg" role="listbox">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        role="option"
                        aria-selected={decision.status === s}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                          decision.status === s ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {decision.status === s && <Check className="h-3 w-3" />}
                        <span className={decision.status === s ? '' : 'ml-5'}>{DECISION_STATUS_LABELS[s]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Decision date */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Date</span>
              {canEdit ? (
                <input
                  type="date"
                  value={formatDateLocal(decision.decisionDate)}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
                  aria-label="Decision date"
                />
              ) : (
                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                  {new Date(decision.decisionDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>

            {/* Category */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Category</span>
              {canEdit ? (
                <input
                  value={categoryValue}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  placeholder="Add category..."
                  className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  aria-label="Category"
                />
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {decision.category || '—'}
                </span>
              )}
            </div>

            {/* Project */}
            {decision.project && (
              <div className="flex items-center gap-3">
                <span className="w-20 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Project</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: decision.project.color }}
                  />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">{decision.project.name}</span>
                </div>
              </div>
            )}

            {/* Created by */}
            <div className="flex items-center gap-3">
              <span className="w-20 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Created</span>
              <div className="flex items-center gap-1.5">
                <Avatar
                  name={decision.createdBy.name}
                  avatarUrl={decision.createdBy.avatarUrl}
                  avatarColor={decision.createdBy.avatarColor ?? undefined}
                  size="xs"
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{decision.createdBy.name}</span>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Participants ({decision.participants.length})
              </span>
              {canEdit && availableParticipants.length > 0 && (
                <button
                  onClick={() => setParticipantOpen(!participantOpen)}
                  className="text-[10px] font-medium hover:underline"
                  style={{ color: BRAND_AMBER }}
                >
                  + Add
                </button>
              )}
            </div>

            {participantOpen && (
              <div className="mb-2 max-h-32 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1" ref={participantRef}>
                {availableParticipants.length > 0 ? (
                  availableParticipants.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleAddParticipant(m.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor ?? undefined} size="xs" />
                      {m.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                    All members are already participants
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              {decision.participants.map((p) => (
                <div key={p.user.id} className="group flex items-center gap-2">
                  <Avatar
                    name={p.user.name}
                    avatarUrl={p.user.avatarUrl}
                    avatarColor={p.user.avatarColor ?? undefined}
                    size="sm"
                  />
                  <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300">{p.user.name}</span>
                  {canEdit && p.user.id !== decision.createdById && (
                    <button
                      onClick={() => handleRemoveParticipant(p.user.id)}
                      className="hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
                      aria-label={`Remove ${p.user.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Supersession info */}
          {(decision.supersedes.length > 0 || decision.supersededBy) && (
            <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
              {decision.supersededBy && (
                <div className="mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Superseded by
                  </span>
                  <button
                    onClick={() => setSelectedDecisionId(decision.supersededBy!.id)}
                    className="mt-1 flex w-full items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                  >
                    <ChevronRight className="h-3 w-3" />
                    {decision.supersededBy.title}
                  </button>
                </div>
              )}

              {decision.supersedes.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Supersedes
                  </span>
                  <div className="mt-1 space-y-1">
                    {decision.supersedes.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDecisionId(d.id)}
                        className="flex w-full items-center gap-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 line-through"
                      >
                        <ChevronRight className="h-3 w-3 no-underline" />
                        <span>{d.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Body / Rationale */}
          <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
            <span className="mb-2 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Rationale
            </span>
            {canEdit ? (
              <textarea
                value={bodyValue}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Document the reasoning behind this decision..."
                rows={6}
                className="w-full resize-none rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 leading-relaxed"
                aria-label="Decision rationale"
              />
            ) : (
              <div className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {decision.body || 'No rationale provided.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-80 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delete decision?</h3>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              This will permanently delete this decision. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
