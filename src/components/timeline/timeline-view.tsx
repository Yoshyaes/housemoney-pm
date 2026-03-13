'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { StatusDot } from '@/components/shared/status-badge';
import { Avatar } from '@/components/shared/avatar';
import { TimelineHeader } from './timeline-header';
import { TimelineTaskBar } from './timeline-task-bar';
import { TimelineDependencyLayer } from './timeline-dependency-layer';
import {
  type ZoomLevel,
  computeAutoRange,
  generateTimeColumns,
  getTotalWidth,
  getTodayX,
  ROW_HEIGHT,
  LEFT_PANEL_WIDTH,
  HEADER_HEIGHT,
  ZOOM_CONFIGS,
} from './timeline-utils';

interface TimelineTask {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string | Date;
  dueDate?: string | Date | null;
  assignee?: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null;
  blocking: Array<{ blockedTask: { id: string; identifier: string; title: string; status: string } }>;
  blockedBy: Array<{ blockingTask: { id: string; identifier: string; title: string; status: string } }>;
}

interface TimelineViewProps {
  tasks: TimelineTask[];
  onTaskUpdate: (taskId: string, field: string, value: unknown) => void;
}

export function TimelineView({ tasks, onTaskUpdate }: TimelineViewProps) {
  const openTaskDetail = useUIStore((s) => s.openTaskDetail);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Sort tasks: active first, then by priority, then by creation date
  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
    return [...tasks].sort((a, b) => {
      const aActive = a.status !== 'DONE' && a.status !== 'CANCELLED' ? 0 : 1;
      const bActive = b.status !== 'DONE' && b.status !== 'CANCELLED' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aPri = priorityOrder[a.priority] ?? 4;
      const bPri = priorityOrder[b.priority] ?? 4;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [tasks]);

  // Compute date range and columns
  const { rangeStart, rangeEnd } = useMemo(
    () => computeAutoRange(sortedTasks, zoom),
    [sortedTasks, zoom]
  );

  const groups = useMemo(
    () => generateTimeColumns(rangeStart, rangeEnd, zoom),
    [rangeStart, rangeEnd, zoom]
  );

  const totalWidth = useMemo(() => getTotalWidth(groups), [groups]);
  const totalHeight = sortedTasks.length * ROW_HEIGHT;
  const todayX = useMemo(() => getTodayX(rangeStart, zoom), [rangeStart, zoom]);

  // Scroll to today on mount / zoom change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetScroll = Math.max(0, todayX - container.clientWidth / 3);
    container.scrollLeft = targetScroll;
    setScrollLeft(targetScroll);
  }, [todayX, zoom]);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  // Flatten dependencies for the arrow layer
  const dependencies = useMemo(() => {
    const deps: Array<{ id: string; blockingTaskId: string; blockedTaskId: string }> = [];
    const seen = new Set<string>();
    for (const task of sortedTasks) {
      for (const dep of task.blocking) {
        const key = `${task.id}-${dep.blockedTask.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          deps.push({
            id: key,
            blockingTaskId: task.id,
            blockedTaskId: dep.blockedTask.id,
          });
        }
      }
    }
    return deps;
  }, [sortedTasks]);

  const handleDueDateChange = useCallback(
    (taskId: string, newDueDate: Date) => {
      onTaskUpdate(taskId, 'dueDate', newDueDate);
    },
    [onTaskUpdate]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with zoom controls */}
      <div className="flex flex-shrink-0 border-b border-zinc-200/60 dark:border-zinc-800">
        {/* Left panel header */}
        <div
          className="flex flex-shrink-0 items-center border-r border-zinc-200/60 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
          style={{ width: LEFT_PANEL_WIDTH, height: HEADER_HEIGHT }}
        >
          Tasks ({sortedTasks.length})
        </div>

        {/* Time header */}
        <div className="flex-1 overflow-hidden">
          <TimelineHeader
            groups={groups}
            zoom={zoom}
            onZoomChange={setZoom}
            scrollLeft={scrollLeft}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: task names */}
        <div
          className="flex-shrink-0 overflow-y-auto border-r border-zinc-200/60 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          {sortedTasks.map((task, i) => (
            <div
              key={task.id}
              className="group flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-900/50"
              style={{ height: ROW_HEIGHT }}
              onClick={() => openTaskDetail(task.id)}
            >
              <StatusDot status={task.status} />
              <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                <span className="mr-1.5 text-zinc-400 dark:text-zinc-500">
                  {task.identifier}
                </span>
                {task.title}
              </span>
              {task.assignee && (
                <div className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100">
                  <Avatar
                    name={task.assignee.name}
                    avatarUrl={(task.assignee as { avatarUrl?: string | null }).avatarUrl}
                    avatarColor={(task.assignee as { avatarColor?: string }).avatarColor}
                    size="xs"
                  />
                </div>
              )}
            </div>
          ))}
          {sortedTasks.length === 0 && (
            <div className="flex h-32 items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
              No tasks to display
            </div>
          )}
        </div>

        {/* Right panel: timeline bars */}
        <div
          ref={scrollContainerRef}
          className="relative flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
            {/* Grid lines */}
            {groups.map((group) => {
              let offset = 0;
              for (const g of groups) {
                if (g.key === group.key) break;
                offset += g.width;
              }
              return group.columns.map((col, ci) => {
                const colOffset = offset + ci * ZOOM_CONFIGS[zoom].columnWidth;
                return (
                  <div
                    key={`${group.key}-${ci}`}
                    className="absolute top-0 border-l border-zinc-100 dark:border-zinc-800/50"
                    style={{
                      left: colOffset,
                      height: totalHeight,
                      width: ZOOM_CONFIGS[zoom].columnWidth,
                    }}
                  />
                );
              });
            })}

            {/* Row stripes */}
            {sortedTasks.map((_, i) => (
              <div
                key={i}
                className={`absolute border-b border-zinc-100 dark:border-zinc-800/50 ${
                  i % 2 === 1 ? 'bg-zinc-50/50 dark:bg-zinc-900/30' : ''
                }`}
                style={{
                  top: i * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  width: totalWidth,
                }}
              />
            ))}

            {/* Today line */}
            {todayX > 0 && todayX < totalWidth && (
              <div
                className="absolute top-0 z-10 w-px"
                style={{
                  left: todayX,
                  height: totalHeight,
                  backgroundColor: '#BA7517',
                  opacity: 0.6,
                }}
              >
                <div className="absolute -left-[11px] -top-0.5 rounded-sm bg-amber-600 px-1 py-px text-[8px] font-bold text-white">
                  TODAY
                </div>
              </div>
            )}

            {/* Dependency arrows */}
            <TimelineDependencyLayer
              tasks={sortedTasks}
              dependencies={dependencies}
              rangeStart={rangeStart}
              zoom={zoom}
              totalWidth={totalWidth}
              totalHeight={totalHeight}
            />

            {/* Task bars */}
            {sortedTasks.map((task, i) => (
              <TimelineTaskBar
                key={task.id}
                task={task}
                rowIndex={i}
                rangeStart={rangeStart}
                zoom={zoom}
                onDueDateChange={handleDueDateChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
