'use client';

import { memo } from 'react';
import {
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ZoomLevel, TimeGroup } from './timeline-utils';
import { ZOOM_CONFIGS, HEADER_HEIGHT } from './timeline-utils';

const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

interface TimelineHeaderProps {
  groups: TimeGroup[];
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  scrollLeft: number;
}

export const TimelineHeader = memo(function TimelineHeader({
  groups,
  zoom,
  onZoomChange,
  scrollLeft,
}: TimelineHeaderProps) {
  const config = ZOOM_CONFIGS[zoom];
  const zoomIdx = ZOOM_ORDER.indexOf(zoom);
  const canZoomIn = zoomIdx > 0;
  const canZoomOut = zoomIdx < ZOOM_ORDER.length - 1;

  return (
    <div className="relative flex-shrink-0" style={{ height: HEADER_HEIGHT }}>
      {/* Zoom controls - fixed position */}
      <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 rounded-md border border-zinc-200 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          onClick={() => canZoomIn && onZoomChange(ZOOM_ORDER[zoomIdx - 1])}
          disabled={!canZoomIn}
          className="rounded p-0.5 text-zinc-500 hover:text-zinc-700 disabled:opacity-30 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[42px] text-center text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
          {ZOOM_LABELS[zoom]}
        </span>
        <button
          onClick={() => canZoomOut && onZoomChange(ZOOM_ORDER[zoomIdx + 1])}
          disabled={!canZoomOut}
          className="rounded p-0.5 text-zinc-500 hover:text-zinc-700 disabled:opacity-30 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Time axis - scrolls with timeline */}
      <div
        className="absolute inset-0 overflow-hidden border-b border-zinc-200/60 dark:border-zinc-800"
        style={{ left: 0 }}
      >
        <div
          className="flex h-full"
          style={{ transform: `translateX(${-scrollLeft}px)` }}
        >
          {groups.map((group) => (
            <div
              key={group.key}
              className="flex flex-shrink-0 flex-col"
              style={{ width: group.width }}
            >
              {/* Primary row (month/year) */}
              <div className="flex h-1/2 items-center border-b border-zinc-100 px-2 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                {group.label}
              </div>

              {/* Secondary row (day/week numbers) */}
              <div className="flex h-1/2">
                {group.columns.map((col, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-center text-[10px] ${
                      col.isToday
                        ? 'font-bold text-amber-600 dark:text-amber-400'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                    style={{ width: config.columnWidth }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
