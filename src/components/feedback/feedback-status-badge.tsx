'use client';

import {
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_STATUS_BG_COLORS,
  FEEDBACK_STATUS_TEXT_COLORS,
  FEEDBACK_STATUS_LABELS,
} from '@/lib/constants';

interface FeedbackStatusBadgeProps {
  status: string;
  className?: string;
}

export function FeedbackStatusBadge({ status, className = '' }: FeedbackStatusBadgeProps) {
  const key = status as keyof typeof FEEDBACK_STATUS_COLORS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: FEEDBACK_STATUS_BG_COLORS[key] ?? 'rgba(136,135,128,.12)',
        color: FEEDBACK_STATUS_TEXT_COLORS[key] ?? '#444441',
      }}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: FEEDBACK_STATUS_COLORS[key] ?? '#888780' }}
      />
      {FEEDBACK_STATUS_LABELS[key] ?? status}
    </span>
  );
}
