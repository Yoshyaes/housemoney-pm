'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityIndicator, PriorityDot } from '@/components/shared/priority-indicator';
import { Avatar } from '@/components/shared/avatar';
import { formatDueDate } from '@/lib/utils';
import { ArrowUp, ArrowDown, Check, ChevronRight, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';

type Task = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  sectionId?: string | null;
  dueDate?: string | Date | null;
  assignee?: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null;
  labels: Array<{ label: { id: string; name: string; color: string; bgColor: string } }>;
  blockedBy: Array<{ blockingTask: { status: string } }>;
};

type Section = {
  id: string;
  name: string;
  order: number;
};

interface ListViewProps {
  tasks: Task[];
  onTaskUpdate: (taskId: string, field: string, value: unknown) => void;
  projectId?: string | null;
  sections?: Section[];
  onSectionCreate?: (name: string) => void;
  onSectionRename?: (id: string, name: string) => void;
  onSectionDelete?: (id: string) => void;
  onTaskMoveToSection?: (taskId: string, sectionId: string | null) => void;
  onQuickCreateTask?: (title: string, sectionId: string | null) => void;
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

function QuickAddTaskRow({
  sectionId,
  onAdd,
  onCancel,
}: {
  sectionId: string | null;
  onAdd: (title: string, sectionId: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (title.trim()) {
      onAdd(title.trim(), sectionId);
      setTitle('');
    }
    onCancel();
  };

  return (
    <div className="flex items-center gap-2 border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-[7px] bg-zinc-50/50 dark:bg-zinc-800/30">
      <div className="w-[24px] flex-shrink-0" />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        onBlur={submit}
        placeholder="Task name..."
        className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
      />
    </div>
  );
}

function SectionHeader({
  section,
  taskCount,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  onAddTask,
}: {
  section: Section;
  taskCount: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddTask: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group flex items-center gap-1.5 border-b border-zinc-200/60 dark:border-zinc-800 px-3 py-[6px] bg-zinc-50/80 dark:bg-zinc-900/60 sticky top-[34px] z-[5]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onToggle}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-transform"
        style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
      >
        <ChevronRight className="h-3 w-3" />
      </button>

      {editing ? (
        <InlineEditInput
          value={section.name}
          onSave={(name) => { onRename(name); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          onClick={onToggle}
          className="flex-1 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {section.name}
        </button>
      )}

      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{taskCount}</span>

      {hovered && !editing && (
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={onAddTask}
            title="Add task"
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => setEditing(true)}
            title="Rename section"
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            title="Delete section"
            className="rounded p-0.5 text-zinc-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

const COLUMNS: { field: SortField; label: string; width: string }[] = [
  { field: 'identifier', label: '', width: '24px' },
  { field: 'title', label: 'Task', width: '1fr' },
  { field: 'status', label: 'Status', width: '100px' },
  { field: 'assignee', label: 'Assignee', width: '90px' },
  { field: 'priority', label: 'Priority', width: '80px' },
  { field: 'dueDate', label: 'Due date', width: '100px' },
];
const GRID_COLS = COLUMNS.map((c) => c.width).join(' ');

export function ListView({
  tasks,
  onTaskUpdate,
  projectId,
  sections = [],
  onSectionCreate,
  onSectionRename,
  onSectionDelete,
  onTaskMoveToSection,
  onQuickCreateTask,
}: ListViewProps) {
  const { openTaskDetail, selectedIndex, setSelectedIndex, selectedTaskIds, inlineEditingTaskId, setInlineEditingTaskId } = useUIStore();
  const [sortField, setSortField] = useState<SortField>('identifier');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [addingTaskToSection, setAddingTaskToSection] = useState<string | null | 'unsectioned'>(undefined as unknown as null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const newSectionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSection) newSectionInputRef.current?.focus();
  }, [addingSection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortTasks = (list: Task[]) => {
    const sorted = [...list];
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
  };

  // Group tasks by section
  const { sectionedTasks, unsectionedTasks } = useMemo(() => {
    const bySection: Record<string, Task[]> = {};
    const unsectioned: Task[] = [];

    for (const task of tasks) {
      if (task.sectionId) {
        if (!bySection[task.sectionId]) bySection[task.sectionId] = [];
        bySection[task.sectionId].push(task);
      } else {
        unsectioned.push(task);
      }
    }
    return { sectionedTasks: bySection, unsectionedTasks: unsectioned };
  }, [tasks]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />;
  };

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTaskRow = (task: Task, index: number, dragTarget?: string | null) => {
    const isBlocked = task.blockedBy?.some(
      (dep) => dep.blockingTask.status !== 'DONE' && dep.blockingTask.status !== 'CANCELLED'
    );
    const isSelected = selectedIndex === index;
    const isMultiSelected = selectedTaskIds.has(task.id);
    const isInlineEditing = inlineEditingTaskId === task.id;

    return (
      <div
        key={task.id}
        draggable={!!onTaskMoveToSection}
        onDragStart={(e) => {
          e.dataTransfer.setData('taskId', task.id);
        }}
        data-task-index={index}
        onClick={() => {
          setSelectedIndex(index);
          if (!isInlineEditing) openTaskDetail(task.id);
        }}
        className={`grid cursor-pointer items-center gap-0 border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-[7px] text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
          isSelected ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
        } ${isMultiSelected ? 'border-l-2 border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/20' : ''}`}
        style={{ gridTemplateColumns: GRID_COLS }}
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

        <div><StatusBadge status={task.status} /></div>

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

        <div><PriorityIndicator priority={task.priority} /></div>
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatDueDate(task.dueDate)}</div>
      </div>
    );
  };

  // Auto-scroll to selected row
  useEffect(() => {
    if (selectedIndex >= 0) {
      const row = document.querySelector(`[data-task-index="${selectedIndex}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Flat mode: no project selected or no sections defined
  const useSections = !!projectId && sections.length > 0;

  // Build a flat index for keyboard nav
  const allTasksFlat = useMemo(() => {
    if (!useSections) return sortTasks(tasks);
    const result: Task[] = [];
    for (const section of sections) {
      const st = sectionedTasks[section.id] || [];
      if (!collapsedSections.has(section.id)) result.push(...sortTasks(st));
    }
    if (unsectionedTasks.length > 0 && !collapsedSections.has('__unsectioned__')) {
      result.push(...sortTasks(unsectionedTasks));
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sections, sectionedTasks, unsectionedTasks, collapsedSections, sortField, sortDir, useSections]);

  const submitNewSection = () => {
    if (newSectionName.trim() && onSectionCreate) {
      onSectionCreate(newSectionName.trim());
    }
    setNewSectionName('');
    setAddingSection(false);
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div
        className="sticky top-0 z-10 grid items-center gap-0 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-[7px]"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <div />
        {COLUMNS.slice(1).map((col) => (
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

      {/* Section-based rendering */}
      {useSections ? (
        <>
          {sections.map((section) => {
            const sectionTasks = sortTasks(sectionedTasks[section.id] || []);
            const collapsed = collapsedSections.has(section.id);

            return (
              <div
                key={section.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const taskId = e.dataTransfer.getData('taskId');
                  if (taskId && onTaskMoveToSection) onTaskMoveToSection(taskId, section.id);
                }}
              >
                <SectionHeader
                  section={section}
                  taskCount={sectionTasks.length}
                  collapsed={collapsed}
                  onToggle={() => toggleSection(section.id)}
                  onRename={(name) => onSectionRename?.(section.id, name)}
                  onDelete={() => onSectionDelete?.(section.id)}
                  onAddTask={() => setAddingTaskToSection(section.id)}
                />
                {!collapsed && (
                  <>
                    {sectionTasks.map((task) => renderTaskRow(task, allTasksFlat.indexOf(task)))}
                    {addingTaskToSection === section.id ? (
                      <QuickAddTaskRow
                        sectionId={section.id}
                        onAdd={(title, sid) => onQuickCreateTask?.(title, sid)}
                        onCancel={() => setAddingTaskToSection(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingTaskToSection(section.id)}
                        className="flex w-full items-center gap-1.5 border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-[7px] text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                      >
                        <Plus className="h-3 w-3" />
                        Add task
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Unsectioned tasks */}
          {unsectionedTasks.length > 0 && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const taskId = e.dataTransfer.getData('taskId');
                if (taskId && onTaskMoveToSection) onTaskMoveToSection(taskId, null);
              }}
            >
              <div className="group flex items-center gap-1.5 border-b border-zinc-200/60 dark:border-zinc-800 px-3 py-[6px] bg-zinc-50/80 dark:bg-zinc-900/60 sticky top-[34px] z-[5]">
                <button
                  onClick={() => toggleSection('__unsectioned__')}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-transform"
                  style={{ transform: collapsedSections.has('__unsectioned__') ? 'rotate(0deg)' : 'rotate(90deg)' }}
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <span className="flex-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">No section</span>
                <span className="text-[10px] text-zinc-400 tabular-nums">{unsectionedTasks.length}</span>
              </div>
              {!collapsedSections.has('__unsectioned__') &&
                sortTasks(unsectionedTasks).map((task) => renderTaskRow(task, allTasksFlat.indexOf(task)))}
            </div>
          )}

          {/* Add section row */}
          <div className="px-4 py-3">
            {addingSection ? (
              <div className="flex items-center gap-2">
                <input
                  ref={newSectionInputRef}
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitNewSection(); }
                    if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); }
                  }}
                  onBlur={submitNewSection}
                  placeholder="Section name..."
                  className="flex-1 rounded border border-amber-400 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingSection(true)}
                className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <Plus className="h-3 w-3" />
                Add section
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Flat list (no project selected or no sections yet) */}
          {sortTasks(tasks).map((task, index) => renderTaskRow(task, index))}

          {/* Add section — only shown when a project is active */}
          {!!projectId && (
            <div className="px-4 py-3">
              {addingSection ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={newSectionInputRef}
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitNewSection(); }
                      if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); }
                    }}
                    onBlur={submitNewSection}
                    placeholder="Section name..."
                    className="flex-1 rounded border border-amber-400 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingSection(true)}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <Plus className="h-3 w-3" />
                  Add section
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
