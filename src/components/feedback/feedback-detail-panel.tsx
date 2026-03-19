'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Trash2, MessageSquare, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useFeedbackStore } from '@/lib/stores/feedback-store';
import { FeedbackStatusBadge } from './feedback-status-badge';
import { FeedbackTypeBadge } from './feedback-type-badge';
import { Avatar } from '@/components/shared/avatar';
import { formatDistanceToNow } from 'date-fns';
import {
  BRAND_AMBER,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_ORDER,
  FEEDBACK_TYPE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from '@/lib/constants';

interface FeedbackDetailPanelProps {
  currentUserId: string | null;
  isAdmin?: boolean;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
  projects: Array<{ id: string; name: string; color: string }>;
}

export function FeedbackDetailPanel({ currentUserId, isAdmin, members, projects }: FeedbackDetailPanelProps) {
  const { selectedFeedbackId, setSelectedFeedbackId } = useFeedbackStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();

  const { data: feedback, isLoading } = trpc.feedback.get.useQuery(
    { id: selectedFeedbackId! },
    { enabled: !!selectedFeedbackId }
  );

  const updateFeedback = trpc.feedback.update.useMutation({
    onSuccess: () => {
      utils.feedback.get.invalidate({ id: selectedFeedbackId! });
      utils.feedback.list.invalidate();
      utils.feedback.getStats.invalidate();
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const deleteFeedback = trpc.feedback.delete.useMutation({
    onSuccess: () => {
      setSelectedFeedbackId(null);
      utils.feedback.list.invalidate();
      utils.feedback.getStats.invalidate();
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const { data: comments = [] } = trpc.feedbackComments.list.useQuery(
    { feedbackId: selectedFeedbackId! },
    { enabled: !!selectedFeedbackId }
  );
  const addComment = trpc.feedbackComments.create.useMutation({
    onSuccess: () => {
      utils.feedbackComments.list.invalidate({ feedbackId: selectedFeedbackId! });
      setCommentBody('');
    },
  });
  const deleteComment = trpc.feedbackComments.delete.useMutation({
    onSuccess: () => utils.feedbackComments.list.invalidate({ feedbackId: selectedFeedbackId! }),
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedUpdate = (field: string, value: unknown) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!selectedFeedbackId) return;
      updateFeedback.mutate({ id: selectedFeedbackId, [field]: value });
    }, 500);
  };

  const immediateUpdate = (field: string, value: unknown) => {
    if (!selectedFeedbackId) return;
    updateFeedback.mutate({ id: selectedFeedbackId, [field]: value });
  };

  useEffect(() => {
    if (feedback) {
      setTitleValue(feedback.title);
    }
  }, [feedback]);

  if (!selectedFeedbackId) return null;

  const canEdit = feedback && (feedback.createdById === currentUserId || isAdmin);

  const inputCls = 'w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600';
  const labelCls = 'mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500';
  const readonlyCls = 'text-xs text-zinc-600 dark:text-zinc-400';

  return (
    <div className="flex h-full w-96 flex-shrink-0 flex-col border-l border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {feedback && (
            <>
              <span className="font-mono text-[11px] text-zinc-400">{feedback.identifier}</span>
              <FeedbackStatusBadge status={feedback.status} />
            </>
          )}
        </div>
        <button
          onClick={() => setSelectedFeedbackId(null)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
      ) : !feedback ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Feedback not found</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {/* Error */}
          {mutationError && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400 mb-2">
              <span className="flex-1">{mutationError}</span>
              <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Title */}
          <div className="mb-3">
            {editingTitle && canEdit ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => { setEditingTitle(false); if (titleValue.trim() && titleValue !== feedback.title) immediateUpdate('title', titleValue.trim()); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); if (titleValue.trim() && titleValue !== feedback.title) immediateUpdate('title', titleValue.trim()); } if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(feedback.title); } }}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none"
              />
            ) : (
              <h2
                onClick={() => canEdit && setEditingTitle(true)}
                className={`text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${canEdit ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded px-1 -mx-1' : ''}`}
              >
                {feedback.title}
              </h2>
            )}
          </div>

          {/* Submitted by */}
          <div className="mb-3 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <Avatar
              name={feedback.createdBy.name}
              avatarUrl={feedback.createdBy.avatarUrl}
              avatarColor={feedback.createdBy.avatarColor ?? undefined}
              size="xs"
            />
            <span>Submitted by <span className="font-medium text-zinc-700 dark:text-zinc-300">{feedback.createdBy.name}</span></span>
          </div>

          {/* Metadata fields */}
          <div className="space-y-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Type</label>
                {canEdit ? (
                  <select value={feedback.type} onChange={(e) => immediateUpdate('type', e.target.value)} className={inputCls}>
                    {Object.entries(FEEDBACK_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <FeedbackTypeBadge type={feedback.type} />
                )}
              </div>
              <div>
                <label className={labelCls}>Status</label>
                {canEdit ? (
                  <select value={feedback.status} onChange={(e) => immediateUpdate('status', e.target.value)} className={inputCls}>
                    {FEEDBACK_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <FeedbackStatusBadge status={feedback.status} />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Priority</label>
                {canEdit ? (
                  <select value={feedback.priority} onChange={(e) => immediateUpdate('priority', e.target.value)} className={inputCls}>
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                ) : (
                  <p className={readonlyCls}>{PRIORITY_LABELS[feedback.priority] ?? feedback.priority}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Assignee</label>
                {canEdit ? (
                  <select value={feedback.assigneeId ?? ''} onChange={(e) => immediateUpdate('assigneeId', e.target.value || null)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {feedback.assignee ? (
                      <>
                        <Avatar name={feedback.assignee.name} avatarUrl={feedback.assignee.avatarUrl} avatarColor={feedback.assignee.avatarColor ?? undefined} size="xs" />
                        <span className={readonlyCls}>{feedback.assignee.name}</span>
                      </>
                    ) : (
                      <span className={readonlyCls}>—</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className={labelCls}>Project</label>
              {canEdit ? (
                <select value={feedback.projectId ?? ''} onChange={(e) => immediateUpdate('projectId', e.target.value || null)} className={inputCls}>
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <p className={readonlyCls}>{feedback.project?.name || '—'}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-3">
            <label className={labelCls}>Description</label>
            {canEdit ? (
              <textarea
                value={feedback.description}
                onChange={(e) => debouncedUpdate('description', e.target.value)}
                rows={4}
                className={`${inputCls} resize-none`}
                placeholder="Add a description..."
              />
            ) : (
              <p className={`${readonlyCls} whitespace-pre-wrap`}>{feedback.description || '—'}</p>
            )}
          </div>

          {/* === COMMENTS === */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
              {comments.length > 0 && (
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 normal-case tracking-normal">
                  {comments.length}
                </span>
              )}
            </div>

            {/* Comment list */}
            <div className="mb-3 space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="group flex gap-2">
                  <Avatar
                    name={c.author.name}
                    avatarUrl={c.author.avatarUrl}
                    avatarColor={c.author.avatarColor ?? undefined}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{c.author.name}</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                      <button
                        onClick={() => deleteComment.mutate({ id: c.id })}
                        className="ml-auto hidden group-hover:block text-[10px] text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* New comment input */}
            <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-300 dark:focus-within:ring-zinc-600">
              <textarea
                ref={commentInputRef}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (commentBody.trim()) addComment.mutate({ feedbackId: selectedFeedbackId!, body: commentBody.trim() });
                  }
                }}
                placeholder="Add a comment… (Ctrl+Enter to submit)"
                rows={2}
                className="w-full resize-none bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
              />
              <div className="flex justify-end px-2 pb-1.5">
                <button
                  onClick={() => {
                    if (commentBody.trim()) addComment.mutate({ feedbackId: selectedFeedbackId!, body: commentBody.trim() });
                  }}
                  disabled={!commentBody.trim() || addComment.isPending}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  <Send className="h-2.5 w-2.5" />
                  Comment
                </button>
              </div>
            </div>
          </div>

          {/* Delete */}
          {canEdit && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
              {deleteConfirmOpen ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-600 dark:text-red-400">Delete this feedback?</span>
                  <button
                    onClick={() => deleteFeedback.mutate({ id: feedback.id })}
                    disabled={deleteFeedback.isPending}
                    className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteFeedback.isPending ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmOpen(false)}
                    className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete feedback
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
