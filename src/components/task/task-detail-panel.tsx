'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityIndicator } from '@/components/shared/priority-indicator';
import { Avatar } from '@/components/shared/avatar';
import { LabelChip } from '@/components/shared/label-chip';
import { formatDueDateFull, linkifyParts } from '@/lib/utils';
import { STATUS_ORDER, PRIORITY_ORDER, STATUS_LABELS, STATUS_BG_COLORS, STATUS_TEXT_COLORS } from '@/lib/constants';
import { X, Plus, UserMinus, CheckSquare, Square, Paperclip, Trash2, File as FileIcon, ArrowLeft, ChevronRight } from 'lucide-react';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { CommentList } from '@/components/comments/comment-list';
import { CommentInput } from '@/components/comments/comment-input';
import { DependencyList } from '@/components/dependencies/dependency-list';
import { PRList } from '@/components/github/pr-list';
import { ActivityList } from '@/components/activity/activity-list';
import { BRAND_AMBER } from '@/lib/constants';

interface TaskDetailPanelProps {
  onUpdate: (taskId: string, field: string, value: unknown) => void;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string }>;
  workspaceId: string;
  currentUser?: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null;
}

type CachedTask = RouterOutputs['tasks']['get'];

export function TaskDetailPanel({ onUpdate, members, workspaceId, currentUser }: TaskDetailPanelProps) {
  const { activeTaskId, closeTaskDetail, openTaskDetail } = useUIStore();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: task } = trpc.tasks.get.useQuery(
    { id: activeTaskId! },
    { enabled: !!activeTaskId }
  );

  // Optimistic helpers — apply a mutation to the cached parent task immediately,
  // capturing a snapshot so onError can roll back, and reconciling on settle.
  const beginOptimistic = async (mutator: (old: CachedTask) => CachedTask) => {
    const taskId = activeTaskId;
    if (!taskId) return undefined;
    await utils.tasks.get.cancel({ id: taskId });
    const snapshot = utils.tasks.get.getData({ id: taskId });
    if (snapshot) {
      utils.tasks.get.setData({ id: taskId }, mutator(snapshot));
    }
    return { snapshot, taskId };
  };
  const rollback = (ctx: { snapshot?: CachedTask; taskId?: string } | undefined) => {
    if (ctx?.snapshot && ctx?.taskId) {
      utils.tasks.get.setData({ id: ctx.taskId }, ctx.snapshot);
    }
  };
  const reconcile = (ctx: { taskId?: string } | undefined) => {
    if (ctx?.taskId) utils.tasks.get.invalidate({ id: ctx.taskId });
  };

  const addCollaborator = trpc.tasks.addCollaborator.useMutation({
    onMutate: async ({ userId }) => {
      const member = members.find((m) => m.id === userId);
      if (!member) return undefined;
      return beginOptimistic((old) => ({
        ...old,
        collaborators: [
          ...old.collaborators,
          {
            taskId: old.id,
            userId,
            user: {
              id: member.id,
              name: member.name,
              avatarUrl: member.avatarUrl ?? null,
              avatarColor: member.avatarColor ?? null,
            },
          } as never,
        ],
      }));
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const removeCollaborator = trpc.tasks.removeCollaborator.useMutation({
    onMutate: async ({ userId }) =>
      beginOptimistic((old) => ({
        ...old,
        collaborators: old.collaborators.filter((c) => c.userId !== userId),
      })),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const createSubtask = trpc.tasks.create.useMutation({
    onMutate: async (input) =>
      beginOptimistic((old) => ({
        ...old,
        subtasks: [
          ...old.subtasks,
          {
            id: `temp-${Date.now()}`,
            identifier: '…',
            title: input.title,
            status: 'TODO',
            priority: 'NONE',
            assignee: null,
            assigneeId: null,
            labels: [],
            createdAt: new Date(),
          } as never,
        ],
      })),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const updateSubtask = trpc.tasks.update.useMutation({
    onMutate: async (input) =>
      beginOptimistic((old) => ({
        ...old,
        subtasks: old.subtasks.map((s) =>
          s.id === input.id ? ({ ...s, ...input } as typeof s) : s
        ),
      })),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const addAttachment = trpc.tasks.addAttachment.useMutation({
    onMutate: async (input) =>
      beginOptimistic((old) => ({
        ...old,
        attachments: [
          ...old.attachments,
          {
            id: `temp-${Date.now()}`,
            taskId: old.id,
            name: input.name,
            url: input.url,
            size: input.size ?? null,
            mimeType: input.mimeType ?? null,
            uploadedById: currentUser?.id ?? '',
            uploadedBy: currentUser
              ? {
                  id: currentUser.id,
                  name: currentUser.name,
                  avatarUrl: currentUser.avatarUrl ?? null,
                  avatarColor: currentUser.avatarColor ?? null,
                }
              : null,
            createdAt: new Date(),
          } as never,
        ],
      })),
    onError: (e, _v, ctx) => {
      rollback(ctx);
      alert(`Failed to attach file: ${e.message}`);
    },
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const deleteAttachment = trpc.tasks.deleteAttachment.useMutation({
    onMutate: async ({ id }) =>
      beginOptimistic((old) => ({
        ...old,
        attachments: old.attachments.filter((a) => a.id !== id),
      })),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: (_d, _e, _v, ctx) => reconcile(ctx),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setDeleteConfirmOpen(false);
      closeTaskDetail();
    },
  });

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!editingField) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingField(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingField]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const text = await res.text();
      let data: { url?: string; name?: string; size?: number; mimeType?: string; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        // non-JSON response
      }
      if (!res.ok || !data.url) {
        const errorMsg = data.error || `Upload failed (${res.status})`;
        alert(errorMsg);
        return;
      }
      addAttachment.mutate({ taskId: task.id, name: data.name!, url: data.url, size: data.size, mimeType: data.mimeType });
    } catch (err) {
      console.error('[task] Upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!activeTaskId || !task) return null;

  const handleFieldChange = (field: string, value: unknown) => {
    onUpdate(task.id, field, value);
    setEditingField(null);
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 md:static md:inset-auto md:z-auto md:w-[360px] md:min-w-[360px] md:flex-shrink-0 md:border-l md:border-zinc-200/60 dark:md:border-zinc-800">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-3.5 py-2.5">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{task.identifier}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            title="Delete task"
            className="rounded p-0.5 text-zinc-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={closeTaskDetail}
            className="rounded p-0.5 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Parent breadcrumb for subtasks */}
      {task.parent && (
        <button
          onClick={() => openTaskDetail(task.parent!.id)}
          className="flex w-full items-center gap-1.5 border-b border-zinc-200/60 dark:border-zinc-800 px-3.5 py-2 text-[11px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          <span className="text-zinc-300 dark:text-zinc-600">{task.parent.identifier}</span>
          <span className="truncate">{task.parent.title}</span>
        </button>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {/* Title */}
        <h2 className="mb-3.5 text-[15px] font-medium leading-[1.4] text-zinc-900 dark:text-zinc-100">{task.title}</h2>

        {/* Fields grid */}
        <div ref={dropdownRef} className="mb-4 grid grid-cols-[80px_1fr] gap-x-2.5 gap-y-[7px]">
          {/* Status */}
          <span className="self-center text-[11px] text-zinc-400 dark:text-zinc-500">Status</span>
          <div className="relative">
            <button onClick={() => setEditingField(editingField === 'status' ? null : 'status')}>
              <StatusBadge status={task.status} />
            </button>
            {editingField === 'status' && (
              <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleFieldChange('status', s)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: STATUS_BG_COLORS[s], color: STATUS_TEXT_COLORS[s] }}
                    >
                      {STATUS_LABELS[s]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <span className="self-center text-[11px] text-zinc-400 dark:text-zinc-500">Priority</span>
          <div className="relative">
            <button onClick={() => setEditingField(editingField === 'priority' ? null : 'priority')}>
              <PriorityIndicator priority={task.priority} />
            </button>
            {editingField === 'priority' && (
              <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg">
                {PRIORITY_ORDER.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleFieldChange('priority', p)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <PriorityIndicator priority={p} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee */}
          <span className="self-center text-[11px] text-zinc-400 dark:text-zinc-500">Assignee</span>
          <div className="relative">
            <button
              onClick={() => setEditingField(editingField === 'assignee' ? null : 'assignee')}
              className="flex items-center gap-1.5"
            >
              {task.assignee ? (
                <>
                  <Avatar
                    name={task.assignee.name}
                    avatarUrl={task.assignee.avatarUrl}
                    avatarColor={task.assignee.avatarColor}
                    size="sm"
                  />
                  <span className="text-xs text-zinc-900 dark:text-zinc-100">{task.assignee.name}</span>
                </>
              ) : (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Unassigned</span>
              )}
            </button>
            {editingField === 'assignee' && (
              <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg">
                <button
                  onClick={() => handleFieldChange('assigneeId', null)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Unassigned
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleFieldChange('assigneeId', m.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor} size="xs" />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collaborators */}
          <span className="self-start pt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Collaborators</span>
          <div className="relative">
            <div className="flex flex-wrap items-center gap-1">
              {(task.collaborators || []).map((c) => (
                <div key={c.userId} className="group flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 pl-0.5 pr-1.5 py-0.5">
                  <Avatar name={c.user.name} avatarUrl={c.user.avatarUrl} avatarColor={c.user.avatarColor} size="xs" />
                  <span className="text-[10px] text-zinc-700 dark:text-zinc-300">{c.user.name}</span>
                  <button
                    onClick={() => removeCollaborator.mutate({ taskId: task.id, userId: c.userId })}
                    className="ml-0.5 text-zinc-300 hover:text-red-400 dark:text-zinc-600 dark:hover:text-red-400"
                  >
                    <UserMinus className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditingField(editingField === 'collaborators' ? null : 'collaborators')}
                className="flex items-center gap-0.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500"
              >
                <Plus className="h-2.5 w-2.5" /> Add
              </button>
            </div>
            {editingField === 'collaborators' && (
              <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg min-w-[160px]">
                {members
                  .filter((m) => m.id !== task.assigneeId && !(task.collaborators || []).some((c) => c.userId === m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        addCollaborator.mutate({ taskId: task.id, userId: m.id });
                        setEditingField(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor} size="xs" />
                      {m.name}
                    </button>
                  ))}
                {members.filter((m) => m.id !== task.assigneeId && !(task.collaborators || []).some((c) => c.userId === m.id)).length === 0 && (
                  <p className="px-3 py-1.5 text-[11px] text-zinc-400">No more members to add</p>
                )}
              </div>
            )}
          </div>

          {/* Due date */}
          <span className="self-center text-[11px] text-zinc-400 dark:text-zinc-500">Due date</span>
          <span className="text-xs text-zinc-900 dark:text-zinc-100">{formatDueDateFull(task.dueDate)}</span>

          {/* Labels */}
          <span className="self-center text-[11px] text-zinc-400 dark:text-zinc-500">Label</span>
          <div className="flex flex-wrap gap-1">
            {task.labels?.map((tl) => (
              <LabelChip
                key={tl.label.id}
                name={tl.label.name}
                color={tl.label.color}
                bgColor={tl.label.bgColor}
              />
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Description</div>
        <div className="mb-4 rounded-md bg-zinc-50 dark:bg-zinc-800 p-2 text-xs leading-[1.6] text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-words">
          {task.description
            ? linkifyParts(task.description).map((part, i) =>
                typeof part === 'string' ? (
                  <span key={i}>{part}</span>
                ) : (
                  <a
                    key={i}
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 dark:text-amber-400 hover:underline break-all"
                  >
                    {part.url}
                  </a>
                )
              )
            : 'No description'}
        </div>

        {/* Subtasks */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Subtasks {(task.subtasks?.length ?? 0) > 0 && `(${task.subtasks!.filter(s => s.status === 'DONE').length}/${task.subtasks!.length})`}
            </span>
            <button
              onClick={() => setAddingSubtask(true)}
              className="flex items-center gap-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <div className="space-y-1">
            {(task.subtasks || []).map((sub) => (
              <div key={sub.id} className="flex items-center gap-2 rounded px-1.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 group cursor-pointer transition-colors">
                <button
                  onClick={(e) => { e.stopPropagation(); updateSubtask.mutate({ id: sub.id, status: sub.status === 'DONE' ? 'TODO' : 'DONE' }); }}
                  className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500"
                >
                  {sub.status === 'DONE'
                    ? <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                    : <Square className="h-3.5 w-3.5" />}
                </button>
                <div
                  onClick={() => openTaskDetail(sub.id)}
                  className="flex flex-1 items-center gap-2 min-w-0"
                >
                  <span className={`flex-1 text-xs truncate ${sub.status === 'DONE' ? 'line-through text-zinc-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                    {sub.title}
                  </span>
                  {sub.priority && sub.priority !== 'NONE' && (
                    <PriorityIndicator priority={sub.priority} />
                  )}
                  {sub.assignee && (
                    <Avatar name={sub.assignee.name} avatarUrl={sub.assignee.avatarUrl} avatarColor={sub.assignee.avatarColor} size="xs" />
                  )}
                  <ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
            {addingSubtask && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newSubtaskTitle.trim()) {
                    createSubtask.mutate({
                      title: newSubtaskTitle.trim(),
                      workspaceId,
                      parentId: task.id,
                      projectId: task.projectId ?? undefined,
                      status: 'TODO',
                    });
                    setNewSubtaskTitle('');
                    setAddingSubtask(false);
                  }
                }}
                className="flex items-center gap-2"
              >
                <Square className="h-3.5 w-3.5 flex-shrink-0 text-zinc-300" />
                <input
                  autoFocus
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setAddingSubtask(false)}
                  placeholder="Subtask title…"
                  className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs outline-none text-zinc-900 dark:text-zinc-100"
                />
                <button type="submit" disabled={!newSubtaskTitle.trim()} className="text-[10px] text-amber-600 hover:text-amber-700 disabled:opacity-40 font-medium">Add</button>
                <button type="button" onClick={() => setAddingSubtask(false)} className="text-[10px] text-zinc-400 hover:text-zinc-600">Cancel</button>
              </form>
            )}
          </div>
        </div>

        {/* Attachments */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Attachments {(task.attachments?.length ?? 0) > 0 && `(${task.attachments!.length})`}
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="flex items-center gap-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-40"
            >
              <Paperclip className="h-3 w-3" /> {uploadingFile ? 'Uploading…' : 'Attach'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>
          <div className="space-y-1">
            {(task.attachments || []).map((att) => (
              <div key={att.id} className="flex items-center gap-2 rounded border border-zinc-100 dark:border-zinc-800 px-2 py-1.5 group">
                <FileIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300 hover:text-amber-600"
                >
                  {att.name}
                </a>
                {att.size && (
                  <span className="text-[10px] text-zinc-400">{(att.size / 1024).toFixed(0)}KB</span>
                )}
                <button
                  onClick={() => deleteAttachment.mutate({ id: att.id })}
                  className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {(task.attachments?.length ?? 0) === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded border border-dashed border-zinc-200 dark:border-zinc-700 py-2 text-[10px] text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
              >
                Click to attach a file
              </button>
            )}
          </div>
        </div>

        {/* Dependencies */}
        <DependencyList
          task={task}
          onUpdate={() => activeTaskId && utils.tasks.get.invalidate({ id: activeTaskId })}
          workspaceId={workspaceId}
        />

        {/* Pull Requests */}
        <PRList prs={(task.githubPRs || []) as never} />

        {/* Tab toggle: Comments / Activity */}
        <div className="mb-3 mt-4 flex gap-3 border-b border-zinc-200/60 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('comments')}
            className={`pb-1.5 text-[11px] font-medium transition-colors ${
              activeTab === 'comments'
                ? 'border-b-2 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
            style={activeTab === 'comments' ? { borderBottomColor: BRAND_AMBER } : undefined}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-1.5 text-[11px] font-medium transition-colors ${
              activeTab === 'activity'
                ? 'border-b-2 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
            style={activeTab === 'activity' ? { borderBottomColor: BRAND_AMBER } : undefined}
          >
            Activity
          </button>
        </div>

        {activeTab === 'comments' && (
          <CommentList comments={(task.comments || []) as never} />
        )}

        {activeTab === 'activity' && (
          <ActivityList activities={(task.activities || []) as never} />
        )}
      </div>

      {/* Comment input (only visible on comments tab) */}
      {activeTab === 'comments' && (
        <div className="flex-shrink-0 border-t border-zinc-200/60 dark:border-zinc-800 p-3.5">
          <CommentInput
            taskId={task.id}
            members={members}
            currentUser={currentUser}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => !deleteTask.isPending && setDeleteConfirmOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-80 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delete task?</h3>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              This will permanently delete <span className="font-medium text-zinc-700 dark:text-zinc-300">{task.identifier}</span> along with its comments, activity, and attachments. {(task.subtasks?.length ?? 0) > 0 && 'Its subtasks will be kept as top-level tasks. '}This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteTask.isPending}
                className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTask.mutate({ id: task.id })}
                disabled={deleteTask.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleteTask.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
