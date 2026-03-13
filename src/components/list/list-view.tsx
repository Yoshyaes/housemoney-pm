'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityIndicator, PriorityDot } from '@/components/shared/priority-indicator';
import { Avatar } from '@/components/shared/avatar';
import { formatDueDate } from '@/lib/utils';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';

type Task = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | Date | null;
  assignee?: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null;
  labels: Array<{ label: { id: string; name: string; color: string; bgColor: string } }>;
  blockedBy: Array<{ blockingTask: { status: string } }>;
};

interface ListViewProps {
  tasks: Task[];
  onTaskUpdate: (taskId: string, field: string, value: unknown) => void;
}

type SortField = 'identifier' | 'title' | 'status' | 'assignee' | 'priority' | 'dueDate';

function InlineEditInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          if (editValue.trim()) onSave(editValue.trim());
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (editValue.trim() && editValue.trim() !== value) {
          onSave(editValue.trim());
        } else {
          onCancel();
        }
      }}
      className="w-full rounded border border-amber-400 bg-white dark:bg-zinc-900 px-1 py-0 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
    />
  );
}

export function ListView({ tasks, onTaskUpdate }: ListViewProps) {
  const { openTaskDetail, selectedIndex, setSelectedIndex, selectedTaskIds, inlineEditingTaskId, setInlineEditingTaskId } = useUIStore();
  const [sortField, setSortField] = useState<SortField>('identifier');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'identifier': {
          const numA = parseInt(a.identifier.split('-')[1] || '0');
          const numB = parseInt(b.identifier.split('-')[1] || '0');
          cmp = numA - numB;
          break;
        }
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'assignee':
          cmp = (a.assignee?.name || 'zzz').localeCompare(b.assignee?.name || 'zzz');
          break;
        case 'priority': {
          const order = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
          cmp = order.indexOf(a.priority) - order.indexOf(b.priority);
          break;
        }
        case 'dueDate': {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          cmp = da - db;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [tasks, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-2.5 w-2.5" />
    ) : (
      <ArrowDown className="h-2.5 w-2.5" />
    );
  };

  const columns: { field: SortField; label: string; width: string }[] = [
    { field: 'identifier', label: '', width: '24px' },
    { field: 'title', label: 'Task', width: '1fr' },
    { field: 'status', label: 'Status', width: '100px' },
    { field: 'assignee', label: 'Assignee', width: '90px' },
    { field: 'priority', label: 'Priority', width: '80px' },
    { field: 'dueDate', label: 'Due date', width: '100px' },
  ];

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedIndex >= 0) {
      const row = document.querySelector(`[data-task-index="${selectedIndex}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div
        className="sticky top-0 z-10 grid items-center gap-0 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-[7px]"
        style={{ gridTemplateColumns: columns.map((c) => c.width).join(' ') }}
      >
        <div />
        {columns.slice(1).map((col) => (
          <button
            key={col.field}
            onClick={() => handleSort(col.field)}
            className="flex items-center gap-1 text-left text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            {col.label}
            <SortIcon field={col.field} />
          </button>
        ))}
      </div>

      {/* Rows */}
      {sortedTasks.map((task, index) => {
        const isBlocked = task.blockedBy?.some(
          (dep) => dep.blockingTask.status !== 'DONE' && dep.blockingTask.status !== 'CANCELLED'
        );
        const isSelected = selectedIndex === index;
        const isMultiSelected = selectedTaskIds.has(task.id);
        const isInlineEditing = inlineEditingTaskId === task.id;

        return (
          <div
            key={task.id}
            data-task-index={index}
            onClick={() => {
              setSelectedIndex(index);
              if (!isInlineEditing) openTaskDetail(task.id);
            }}
            className={`grid cursor-pointer items-center gap-0 border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-[7px] text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
              isSelected ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
            } ${isMultiSelected ? 'border-l-2 border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/20' : ''}`}
            style={{ gridTemplateColumns: columns.map((c) => c.width).join(' ') }}
          >
            {isMultiSelected ? (
              <Check className="h-3 w-3 text-amber-600" />
            ) : (
              <PriorityDot priority={task.priority} />
            )}

            <div className="flex items-center gap-1 overflow-hidden">
              <span className="flex-shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">{task.identifier}</span>
              {isInlineEditing ? (
                <InlineEditInput
                  value={task.title}
                  onSave={(newTitle) => {
                    onTaskUpdate(task.id, 'title', newTitle);
                    setInlineEditingTaskId(null);
                  }}
                  onCancel={() => setInlineEditingTaskId(null)}
                />
              ) : (
                <span className="truncate text-zinc-900 dark:text-zinc-100">{task.title}</span>
              )}
              {isBlocked && (
                <span
                  className="ml-1 flex-shrink-0 rounded-full px-1.5 py-px text-[9px]"
                  style={{ backgroundColor: 'rgba(226,75,74,.12)', color: '#A32D2D' }}
                >
                  blocked
                </span>
              )}
            </div>

            <div>
              <StatusBadge status={task.status} />
            </div>

            <div className="flex items-center gap-1.5">
              {task.assignee && (
                <>
                  <Avatar
                    name={task.assignee.name}
                    avatarUrl={task.assignee.avatarUrl}
                    avatarColor={task.assignee.avatarColor}
                    size="xs"
                  />
                  <span className="truncate text-zinc-700 dark:text-zinc-300">{task.assignee.name}</span>
                </>
              )}
            </div>

            <div>
              <PriorityIndicator priority={task.priority} />
            </div>

            <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatDueDate(task.dueDate)}</div>
          </div>
        );
      })}
    </div>
  );
}
