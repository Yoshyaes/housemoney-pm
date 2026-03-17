'use client';

import {
  DECISION_STATUS_COLORS,
  DECISION_STATUS_BG_COLORS,
  DECISION_STATUS_TEXT_COLORS,
  DECISION_STATUS_LABELS,
} from '@/lib/constants';

interface DecisionStatusBadgeProps {
  status: string;
  className?: string;
}

export function DecisionStatusBadge({ status, className = '' }: DecisionStatusBadgeProps) {
  const key = status as keyof typeof DECISION_STATUS_COLORS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: DECISION_STATUS_BG_COLORS[key] ?? 'rgba(136,135,128,.12)',
        color: DECISION_STATUS_TEXT_COLORS[key] ?? '#444441',
      }}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: DECISION_STATUS_COLORS[key] ?? '#888780' }}
      />
      {DECISION_STATUS_LABELS[key] ?? status}
    </span>
  );
}
