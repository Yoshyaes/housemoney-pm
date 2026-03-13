'use client';

import { useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import { TaskCard } from './task-card';
import { Avatar } from '@/components/shared/avatar';
import { LabelChip } from '@/components/shared/label-chip';
import { StatusDot } from '@/components/shared/status-badge';
import { useUIStore } from '@/lib/stores/ui-store';
import { BOARD_COLUMNS, STATUS_LABELS, PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

type Task = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assignee?: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null;
  assigneeId?: string | null;
  labels: Array<{ label: { id: string; name: string; color: string; bgColor: string } }>;
  blockedBy: Array<{ blockingTask: { status: string } }>;
};

interface BoardViewProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: string) => void;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string; role?: string }>;
}

function DroppableCell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[100px] flex-col gap-1.5 border-l border-zinc-200/60 dark:border-zinc-800 p-[7px] ${
        isOver ? 'bg-amber-50/40 dark:bg-amber-900/20' : ''
      }`}
    >
      {children}
    </div>
  );
}

export function BoardView({ tasks, onStatusChange, members }: BoardViewProps) {
  const { swimlaneMode, collapsedSwimlanes, toggleSwimlaneCollapse, setCreateModalOpen } = useUIStore();
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Group tasks by swimlane
  const swimlanes = useMemo(() => {
    if (swimlaneMode === 'none') {
      return [{ key: 'all', label: 'All Tasks', tasks }];
    }

    const groups = new Map<string, { label: string; sublabel?: string; tasks: Task[]; meta?: Record<string, string> }>();

    if (swimlaneMode === 'assignee') {
      for (const member of members) {
        groups.set(member.id, {
          label: member.name,
          sublabel: member.role || '',
          tasks: [],
          meta: { avatarUrl: member.avatarUrl || '', avatarColor: member.avatarColor || '#BA7517', name: member.name },
        });
      }
      groups.set('unassigned', { label: 'Unassigned', tasks: [] });

      for (const task of tasks) {
        const key = task.assigneeId || 'unassigned';
        const group = groups.get(key);
        if (group) group.tasks.push(task);
        else {
          const unassigned = groups.get('unassigned')!;
          unassigned.tasks.push(task);
        }
      }
    } else if (swimlaneMode === 'priority') {
      for (const p of PRIORITY_ORDER) {
        groups.set(p, { label: PRIORITY_LABELS[p], tasks: [], meta: { color: PRIORITY_COLORS[p] } });
      }
      for (const task of tasks) {
        const group = groups.get(task.priority);
        if (group) group.tasks.push(task);
      }
    } else if (swimlaneMode === 'label') {
      const labelMap = new Map<string, { name: string; color: string; bgColor: string }>();
      for (const task of tasks) {
        for (const tl of task.labels) {
          if (!labelMap.has(tl.label.id)) {
            labelMap.set(tl.label.id, tl.label);
            groups.set(tl.label.id, {
              label: tl.label.name,
              tasks: [],
              meta: { color: tl.label.color, bgColor: tl.label.bgColor },
            });
          }
        }
      }
      groups.set('unlabeled', { label: 'No label', tasks: [] });

      for (const task of tasks) {
        if (task.labels.length === 0) {
          groups.get('unlabeled')!.tasks.push(task);
        } else {
          for (const tl of task.labels) {
            groups.get(tl.label.id)?.tasks.push(task);
          }
        }
      }
    }

    // Remove empty groups (except for assignee mode)
    if (swimlaneMode !== 'assignee') {
      Array.from(groups.keys()).forEach((key) => {
        if (groups.get(key)!.tasks.length === 0) groups.delete(key);
      });
    }

    return Array.from(groups.entries()).map(([key, group]) => ({ key, ...group }));
  }, [tasks, swimlaneMode, members]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setDraggedTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTask(null);
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    // Over ID format: "cell-{swimlaneKey}-{status}" or task ID
    const statusMatch = overId.match(/^cell-.*-(.+)$/);
    if (statusMatch) {
      const newStatus = statusMatch[1];
      if (active.id !== newStatus) {
        onStatusChange(active.id as string, newStatus);
      }
    }
  };

  // Count tasks per column
  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const col of BOARD_COLUMNS) {
      counts[col] = tasks.filter((t) => t.status === col).length;
    }
    return counts;
  }, [tasks]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-auto">
        <div className="min-w-[820px]">
          {/* Column headers */}
          <div
            className="sticky top-0 z-10 grid border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950"
            style={{ gridTemplateColumns: swimlaneMode !== 'none' ? '140px repeat(5, 1fr)' : 'repeat(5, 1fr)' }}
          >
            {swimlaneMode !== 'none' && <div className="p-2" />}
            {BOARD_COLUMNS.map((col) => (
              <div
                key={col}
                className="flex items-center gap-1.5 border-l border-zinc-200/60 dark:border-zinc-800 px-2.5 py-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                <StatusDot status={col} />
                {STATUS_LABELS[col]}
                <span className="ml-auto rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400 dark:text-zinc-500">
                  {columnCounts[col]}
                </span>
              </div>
            ))}
          </div>

          {/* Swimlane rows */}
          {swimlanes.map((lane) => {
            const isCollapsed = collapsedSwimlanes.has(lane.key);

            return (
              <div key={lane.key}>
                {swimlaneMode !== 'none' && (
                  <div
                    className="grid border-b border-zinc-200/60 dark:border-zinc-800"
                    style={{ gridTemplateColumns: '140px repeat(5, 1fr)' }}
                  >
                    {/* Swimlane label */}
                    <div
                      className="flex cursor-pointer items-start gap-2 border-r border-zinc-200/60 dark:border-zinc-800 p-2.5"
                      onClick={() => toggleSwimlaneCollapse(lane.key)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
                      ) : (
                        <ChevronDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
                      )}

                      {swimlaneMode === 'assignee' && lane.meta?.name && (
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={lane.meta.name}
                            avatarColor={lane.meta.avatarColor}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100">{lane.label}</div>
                            {lane.sublabel && (
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{lane.sublabel}</div>
                            )}
                          </div>
                        </div>
                      )}

                      {swimlaneMode === 'priority' && (
                        <span className="text-[11px] font-medium" style={{ color: lane.meta?.color }}>
                          {lane.label}
                        </span>
                      )}

                      {swimlaneMode === 'label' && lane.meta?.bgColor && (
                        <LabelChip
                          name={lane.label}
                          color={lane.meta.color || '#666'}
                          bgColor={lane.meta.bgColor || '#eee'}
                        />
                      )}

                      {swimlaneMode === 'label' && !lane.meta?.bgColor && (
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{lane.label}</span>
                      )}
                    </div>

                    {/* Status cells */}
                    {!isCollapsed &&
                      BOARD_COLUMNS.map((col) => {
                        const cellTasks = lane.tasks.filter((t) => t.status === col);
                        const cellId = `cell-${lane.key}-${col}`;

                        return (
                          <DroppableCell key={cellId} id={cellId}>
                            <SortableContext items={cellTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                              {cellTasks.map((task) => (
                                <TaskCard key={task.id} task={task} />
                              ))}
                            </SortableContext>
                            <button
                              onClick={() => setCreateModalOpen(true)}
                              className="flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-500 dark:hover:text-zinc-400"
                            >
                              <Plus className="h-3 w-3" />
                              Add task
                            </button>
                          </DroppableCell>
                        );
                      })}

                    {isCollapsed &&
                      BOARD_COLUMNS.map((col) => (
                        <div key={col} className="border-l border-zinc-200/60 dark:border-zinc-800 p-[7px]" />
                      ))}
                  </div>
                )}

                {swimlaneMode === 'none' && (
                  <div
                    className="grid border-b border-zinc-200/60 dark:border-zinc-800"
                    style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
                  >
                    {BOARD_COLUMNS.map((col) => {
                      const cellTasks = lane.tasks.filter((t) => t.status === col);
                      const cellId = `cell-${lane.key}-${col}`;

                      return (
                        <DroppableCell key={cellId} id={cellId}>
                          <SortableContext items={cellTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                            {cellTasks.map((task) => (
                              <TaskCard key={task.id} task={task} />
                            ))}
                          </SortableContext>
                          <button
                            onClick={() => setCreateModalOpen(true)}
                            className="flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-500 dark:hover:text-zinc-400"
                          >
                            <Plus className="h-3 w-3" />
                            Add task
                          </button>
                        </DroppableCell>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {draggedTask && <TaskCard task={draggedTask} isDraggable={false} />}
      </DragOverlay>
    </DndContext>
  );
}
