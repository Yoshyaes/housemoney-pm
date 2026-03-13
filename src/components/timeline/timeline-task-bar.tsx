'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { STATUS_COLORS } from '@/lib/constants';
import { useUIStore } from '@/lib/stores/ui-store';
import type { ZoomLevel } from './timeline-utils';
import { dateToX, xToDate, getTaskDateRange, ROW_HEIGHT } from './timeline-utils';

interface TimelineTask {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string | Date;
  dueDate?: string | Date | null;
  assignee?: { id: string; name: string } | null;
}

interface TimelineTaskBarProps {
  task: TimelineTask;
  rowIndex: number;
  rangeStart: Date;
  zoom: ZoomLevel;
  onDueDateChange: (taskId: string, newDueDate: Date) => void;
}

export const TimelineTaskBar = memo(function TimelineTaskBar({
  task,
  rowIndex,
  rangeStart,
  zoom,
  onDueDateChange,
}: TimelineTaskBarProps) {
  const openTaskDetail = useUIStore((s) => s.openTaskDetail);
  const { startDate, endDate } = getTaskDateRange(task);

  const x = dateToX(startDate, rangeStart, zoom);
  const endX = dateToX(endDate, rangeStart, zoom);
  const width = Math.max(endX - x, 20); // minimum 20px bar

  const statusColor = STATUS_COLORS[task.status as keyof typeof STATUS_COLORS] || '#888';
  const isDone = task.status === 'DONE' || task.status === 'CANCELLED';

  // Drag state
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startBarX: number;
    barWidth: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragRef.current = {
        startX: e.clientX,
        startBarX: x,
        barWidth: width,
      };
      setIsDragging(true);
      setDragOffset(0);
    },
    [x, width]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      setDragOffset(dx);
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;

      if (Math.abs(dx) > 5) {
        // Compute new end date based on drag offset
        const newEndX = dragRef.current.startBarX + dragRef.current.barWidth + dx;
        const newEndDate = xToDate(newEndX, rangeStart, zoom);
        onDueDateChange(task.id, newEndDate);
      }

      dragRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
    },
    [rangeStart, zoom, task.id, onDueDateChange]
  );

  const top = rowIndex * ROW_HEIGHT;
  const barHeight = ROW_HEIGHT - 8; // 4px padding top/bottom

  return (
    <div
      className={`group absolute flex cursor-grab items-center rounded-[4px] border text-[10px] transition-shadow ${
        isDragging
          ? 'z-20 shadow-lg ring-2 ring-amber-400/40'
          : 'hover:shadow-md hover:z-10'
      } ${isDone ? 'opacity-50' : ''}`}
      style={{
        left: x + dragOffset,
        top: top + 4,
        width,
        height: barHeight,
        backgroundColor: `${statusColor}18`,
        borderColor: `${statusColor}40`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => openTaskDetail(task.id)}
      title={`${task.identifier}: ${task.title}`}
    >
      {/* Status pip */}
      <div
        className="ml-1.5 h-[6px] w-[6px] flex-shrink-0 rounded-full"
        style={{ backgroundColor: statusColor }}
      />
      {/* Label */}
      <span className="ml-1 truncate pr-1.5 font-medium text-zinc-700 dark:text-zinc-200">
        {width > 80 ? task.title : task.identifier}
      </span>

      {/* Resize handle (right edge) */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100"
        style={{ backgroundColor: statusColor }}
        onPointerDown={(e) => {
          e.stopPropagation();
          // Resize logic: only change end date
          const startClientX = e.clientX;
          const origWidth = width;

          const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startClientX;
            const newW = Math.max(origWidth + dx, 20);
            const newEndX = x + newW;
            const newEnd = xToDate(newEndX, rangeStart, zoom);
            onDueDateChange(task.id, newEnd);
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      />
    </div>
  );
});
