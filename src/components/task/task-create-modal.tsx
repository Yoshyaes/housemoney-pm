'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { STATUS_ORDER, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS, BRAND_AMBER } from '@/lib/constants';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface TaskCreateModalProps {
  workspaceId: string;
  projectId?: string | null;
  projects: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string; bgColor: string }>;
  onCreated: () => void;
}

export function TaskCreateModal({
  workspaceId,
  projectId,
  projects,
  members,
  labels,
  onCreated,
}: TaskCreateModalProps) {
  const { createModalOpen, setCreateModalOpen } = useUIStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('NONE');
  const [status, setStatus] = useState('TODO');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const triageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-triage state
  const [triageSuggestions, setTriageSuggestions] = useState<{
    priority: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
    labelIds: string[];
    labelNames: string[];
    reasoning: string | null;
  } | null>(null);
  const [triageApplied, setTriageApplied] = useState<Set<string>>(new Set());

  const triageTask = trpc.ai.triageTask.useMutation({
    onSuccess: (data) => {
      setTriageSuggestions(data);
      setTriageApplied(new Set());
    },
  });

  const triggerTriage = useCallback(
    (titleValue: string) => {
      if (triageTimerRef.current) clearTimeout(triageTimerRef.current);
      if (titleValue.trim().length < 5) {
        setTriageSuggestions(null);
        return;
      }
      triageTimerRef.current = setTimeout(() => {
        triageTask.mutate({ title: titleValue.trim(), workspaceId });
      }, 800);
    },
    [workspaceId, triageTask]
  );

  const applySuggestion = (field: string) => {
    if (!triageSuggestions) return;
    if (field === 'priority' && triageSuggestions.priority) {
      setPriority(triageSuggestions.priority);
    } else if (field === 'assignee' && triageSuggestions.assigneeId) {
      setAssigneeId(triageSuggestions.assigneeId);
    } else if (field === 'labels' && triageSuggestions.labelIds.length > 0) {
      setSelectedLabelIds((prev) => {
        const combined = new Set([...prev, ...triageSuggestions.labelIds]);
        return Array.from(combined);
      });
    }
    setTriageApplied((prev) => new Set(prev).add(field));
  };

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      resetForm();
      setCreateModalOpen(false);
      onCreated();
    },
  });

  useEffect(() => {
    if (createModalOpen) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [createModalOpen]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedProjectId(projectId || '');
    setAssigneeId('');
    setPriority('NONE');
    setStatus('TODO');
    setDueDate('');
    setSelectedLabelIds([]);
    setTriageSuggestions(null);
    setTriageApplied(new Set());
    if (triageTimerRef.current) clearTimeout(triageTimerRef.current);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createTask.mutate({
      title: title.trim(),
      description: description || undefined,
      projectId: selectedProjectId || undefined,
      assigneeId: assigneeId || undefined,
      priority: priority as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
      status: status as 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labelIds: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
      workspaceId,
    });
  };

  if (!createModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-start md:pt-[15vh]" onClick={() => setCreateModalOpen(false)}>
      <div
        className="w-full max-h-[90vh] overflow-y-auto rounded-t-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl md:max-w-lg md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">New task</span>
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="rounded p-1 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                triggerTriage(e.target.value);
              }}
              placeholder="Task title"
              className="w-full text-sm font-medium text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 bg-transparent"
              autoFocus
            />

            {/* AI Auto-Triage Suggestions */}
            {(triageTask.isPending || triageSuggestions) && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/50">
                <Sparkles className="h-3 w-3 flex-shrink-0 text-amber-500" />
                {triageTask.isPending ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing...
                  </span>
                ) : triageSuggestions ? (
                  <>
                    {triageSuggestions.priority && !triageApplied.has('priority') && (
                      <button
                        type="button"
                        onClick={() => applySuggestion('priority')}
                        className="flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[triageSuggestions.priority as keyof typeof PRIORITY_COLORS] }}
                        />
                        {PRIORITY_LABELS[triageSuggestions.priority]}
                      </button>
                    )}
                    {triageSuggestions.assigneeName && !triageApplied.has('assignee') && (
                      <button
                        type="button"
                        onClick={() => applySuggestion('assignee')}
                        className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                      >
                        {triageSuggestions.assigneeName}
                      </button>
                    )}
                    {triageSuggestions.labelNames.length > 0 && !triageApplied.has('labels') && (
                      <button
                        type="button"
                        onClick={() => applySuggestion('labels')}
                        className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                      >
                        {triageSuggestions.labelNames.join(', ')}
                      </button>
                    )}
                    {triageApplied.size > 0 &&
                      triageApplied.size >= [
                        triageSuggestions.priority,
                        triageSuggestions.assigneeName,
                        triageSuggestions.labelNames.length > 0 ? true : null,
                      ].filter(Boolean).length && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">All applied</span>
                      )}
                    {triageSuggestions.reasoning && triageApplied.size === 0 && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        — {triageSuggestions.reasoning}
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              className="w-full resize-none text-xs text-zinc-600 dark:text-zinc-400 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 bg-transparent"
              rows={2}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Labels</label>
                <div className="flex flex-wrap gap-1">
                  {labels.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        setSelectedLabelIds((prev) =>
                          prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id]
                        )
                      }
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                        selectedLabelIds.includes(l.id)
                          ? 'border-transparent font-medium'
                          : 'border-zinc-200 dark:border-zinc-700'
                      }`}
                      style={
                        selectedLabelIds.includes(l.id)
                          ? { backgroundColor: l.bgColor, color: l.color }
                          : { color: '#666' }
                      }
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="mr-2 rounded px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createTask.isPending}
              className="rounded px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND_AMBER }}
            >
              {createTask.isPending ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
