'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { STATUS_ORDER, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS, BRAND_AMBER } from '@/lib/constants';
import { ArrowLeft, Sparkles, Loader2, AlertTriangle } from 'lucide-react';

interface AITaskInputProps {
  workspaceId: string;
  projects: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string; bgColor: string }>;
  onCreated: () => void;
  onCancel: () => void;
}

interface ParsedPreview {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
  dueDate: string | null;
  labelIds: string[];
  labelNames: string[];
  _unmatched: {
    assignee: string | null;
    project: string | null;
    labels: string[];
  };
}

export function AITaskInput({
  workspaceId,
  projects,
  members,
  labels,
  onCreated,
  onCancel,
}: AITaskInputProps) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (populated after parse)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('TODO');
  const [priority, setPriority] = useState('NONE');
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const parseTask = trpc.ai.parseTask.useMutation({
    onSuccess: (data) => {
      setPreview(data);
      setTitle(data.title);
      setDescription(data.description || '');
      setStatus(data.status);
      setPriority(data.priority);
      setAssigneeId(data.assigneeId || '');
      setProjectId(data.projectId || '');
      setDueDate(data.dueDate || '');
      setSelectedLabelIds(data.labelIds);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      onCreated();
    },
  });

  const handleParse = () => {
    if (!input.trim()) return;
    setError(null);
    parseTask.mutate({ text: input.trim(), workspaceId });
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    createTask.mutate({
      title: title.trim(),
      description: description || undefined,
      status: status as 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED',
      priority: priority as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
      assigneeId: assigneeId || undefined,
      projectId: projectId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labelIds: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
      workspaceId,
    });
  };

  const hasUnmatched =
    preview?._unmatched &&
    (preview._unmatched.assignee ||
      preview._unmatched.project ||
      preview._unmatched.labels.length > 0);

  // Input phase
  if (!preview) {
    return (
      <div className="p-2">
        <button
          onClick={onCancel}
          className="mb-2 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>

        <div className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleParse();
              }
            }}
            placeholder='Describe a task, e.g. "High-priority bug for payment flow, assign to Sarah, due Friday"'
            className="w-full bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200 dark:placeholder:text-zinc-600"
            autoFocus
            disabled={parseTask.isPending}
          />
        </div>

        {parseTask.isPending && (
          <div className="mt-3 flex items-center justify-center gap-2 py-4 text-xs text-zinc-400 dark:text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Parsing with AI...
          </div>
        )}

        {error && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-2 px-1 text-[10px] text-zinc-400 dark:text-zinc-600">
          Press Enter to parse with AI
        </div>
      </div>
    );
  }

  // Preview/edit phase
  return (
    <div className="p-2">
      <button
        onClick={() => {
          setPreview(null);
          setError(null);
        }}
        className="mb-2 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
      >
        <ArrowLeft className="h-3 w-3" />
        Try again
      </button>

      {hasUnmatched && (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <div>
            {preview._unmatched.assignee && (
              <div>Could not match assignee &ldquo;{preview._unmatched.assignee}&rdquo; — select manually below</div>
            )}
            {preview._unmatched.project && (
              <div>Could not match project &ldquo;{preview._unmatched.project}&rdquo; — select manually below</div>
            )}
            {preview._unmatched.labels.length > 0 && (
              <div>Could not match labels: {preview._unmatched.labels.join(', ')}</div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:text-zinc-200"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-600 outline-none dark:border-zinc-700 dark:text-zinc-400"
            rows={2}
            placeholder="Optional description..."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-zinc-400 dark:text-zinc-500">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
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
                      prev.includes(l.id)
                        ? prev.filter((id) => id !== l.id)
                        : [...prev, l.id]
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

      <div className="mt-3 flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim() || createTask.isPending}
          className="rounded px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          {createTask.isPending ? 'Creating...' : 'Create task'}
        </button>
      </div>
    </div>
  );
}
