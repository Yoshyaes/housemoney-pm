'use client';

import {
  EXPERIMENT_STATUS_COLORS,
  EXPERIMENT_STATUS_BG_COLORS,
  EXPERIMENT_STATUS_TEXT_COLORS,
  EXPERIMENT_STATUS_LABELS,
} from '@/lib/constants';

interface ExperimentStatusBadgeProps {
  status: string;
  className?: string;
}

export function ExperimentStatusBadge({ status, className = '' }: ExperimentStatusBadgeProps) {
  const key = status as keyof typeof EXPERIMENT_STATUS_COLORS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: EXPERIMENT_STATUS_BG_COLORS[key] ?? 'rgba(136,135,128,.12)',
        color: EXPERIMENT_STATUS_TEXT_COLORS[key] ?? '#444441',
      }}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: EXPERIMENT_STATUS_COLORS[key] ?? '#888780' }}
      />
      {EXPERIMENT_STATUS_LABELS[key] ?? status}
    </span>
  );
}
