'use client';

import { cn } from '@/lib/utils';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface Project {
  id: string;
  name: string;
  color: string;
}

interface AnalyticsTopbarProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  projectId: string | null;
  onProjectChange: (id: string | null) => void;
  projects: Project[];
}

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All time' },
];

export function AnalyticsTopbar({
  dateRange,
  onDateRangeChange,
  projectId,
  onProjectChange,
  projects,
}: AnalyticsTopbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5">
      <h1 className="mr-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Analytics</h1>

      {/* Date range segmented control */}
      <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {DATE_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => onDateRangeChange(r.value)}
            className={cn(
              'px-2.5 py-1 text-xs transition-colors',
              r.value === dateRange
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium'
                : 'bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Project filter */}
      {projects.length > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Project:</span>
          <select
            value={projectId ?? ''}
            onChange={(e) => onProjectChange(e.target.value || null)}
            className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
