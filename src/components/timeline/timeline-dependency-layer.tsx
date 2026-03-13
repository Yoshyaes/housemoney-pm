'use client';

import { memo } from 'react';
import type { ZoomLevel } from './timeline-utils';
import { dateToX, getTaskDateRange, ROW_HEIGHT } from './timeline-utils';

interface DepTask {
  id: string;
  createdAt: string | Date;
  dueDate?: string | Date | null;
}

interface Dependency {
  id: string;
  blockingTaskId: string;
  blockedTaskId: string;
}

interface TimelineDependencyLayerProps {
  tasks: DepTask[];
  dependencies: Dependency[];
  rangeStart: Date;
  zoom: ZoomLevel;
  totalWidth: number;
  totalHeight: number;
}

export const TimelineDependencyLayer = memo(function TimelineDependencyLayer({
  tasks,
  dependencies,
  rangeStart,
  zoom,
  totalWidth,
  totalHeight,
}: TimelineDependencyLayerProps) {
  if (dependencies.length === 0) return null;

  // Build index: taskId → row index
  const taskIndexMap = new Map<string, number>();
  tasks.forEach((t, i) => taskIndexMap.set(t.id, i));

  // Build task lookup
  const taskMap = new Map<string, DepTask>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  const arrows: React.ReactNode[] = [];

  for (const dep of dependencies) {
    const fromTask = taskMap.get(dep.blockingTaskId);
    const toTask = taskMap.get(dep.blockedTaskId);
    if (!fromTask || !toTask) continue;

    const fromIdx = taskIndexMap.get(dep.blockingTaskId);
    const toIdx = taskIndexMap.get(dep.blockedTaskId);
    if (fromIdx === undefined || toIdx === undefined) continue;

    const fromRange = getTaskDateRange(fromTask);
    const toRange = getTaskDateRange(toTask);

    // Arrow goes from end of blocking task to start of blocked task
    const fromX = dateToX(fromRange.endDate, rangeStart, zoom);
    const fromY = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toX = dateToX(toRange.startDate, rangeStart, zoom);
    const toY = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

    // S-curve path
    const midX = (fromX + toX) / 2;
    const path =
      fromX < toX
        ? `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`
        : // If blocked task starts before blocking task ends, route around
          `M ${fromX} ${fromY} L ${fromX + 12} ${fromY} L ${fromX + 12} ${
            (fromY + toY) / 2
          } L ${toX - 12} ${(fromY + toY) / 2} L ${toX - 12} ${toY} L ${toX} ${toY}`;

    arrows.push(
      <g key={dep.id}>
        <path
          d={path}
          fill="none"
          stroke="#BA7517"
          strokeWidth={1.5}
          strokeOpacity={0.5}
          strokeDasharray={fromX >= toX ? '4 2' : undefined}
        />
        {/* Arrowhead */}
        <polygon
          points={`${toX},${toY} ${toX - 5},${toY - 3} ${toX - 5},${toY + 3}`}
          fill="#BA7517"
          fillOpacity={0.6}
        />
      </g>
    );
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={totalWidth}
      height={totalHeight}
      style={{ overflow: 'visible' }}
    >
      {arrows}
    </svg>
  );
});
