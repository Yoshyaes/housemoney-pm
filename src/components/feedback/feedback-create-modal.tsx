'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useFeedbackStore } from '@/lib/stores/feedback-store';
import {
  BRAND_AMBER,
  FEEDBACK_TYPE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from '@/lib/constants';
import type { FeedbackType, Priority } from '@/generated/prisma/client';

interface FeedbackCreateModalProps {
  workspaceId: string;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
  projects: Array<{ id: string; name: string; color: string }>;
}

export function FeedbackCreateModal({ workspaceId, members, projects }: FeedbackCreateModalProps) {
  const { createModalOpen, setCreateModalOpen, setSelectedFeedbackId } = useFeedbackStore();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('BUG');
  const [priority, setPriority] = useState<string>('NONE');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const createFeedback = trpc.feedback.create.useMutation({
    onSuccess: (fb) => {
      utils.feedback.list.invalidate();
      utils.feedback.getStats.invalidate();
      resetForm();
      setCreateModalOpen(false);
      setSelectedFeedbackId(fb.id);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setType('BUG');
    setPriority('NONE');
    setDescription('');
    setProjectId('');
    setAssigneeId('');
    setMutationError(null);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    setMutationError(null);
    createFeedback.mutate({
      workspaceId,
      title: title.trim(),
      type: type as FeedbackType,
      priority: priority as Priority,
      description,
      projectId: projectId || undefined,
      assigneeId: assigneeId || undefined,
    });
  };

  if (!createModalOpen) return null;

  const inputCls = 'w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600';
  const labelCls = 'mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={() => { setCreateModalOpen(false); resetForm(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Submit new feedback"
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg rounded-t-lg md:rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Feedback</h3>
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
          <div>
            <label className={labelCls}>Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="Brief summary of the issue or request"
              className={inputCls}
              aria-required="true"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details, steps to reproduce, expected behavior, etc."
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Assignee</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
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
            disabled={!title.trim() || createFeedback.isPending}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_AMBER }}
          >
            {createFeedback.isPending ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
