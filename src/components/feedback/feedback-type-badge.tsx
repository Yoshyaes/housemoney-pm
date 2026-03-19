'use client';

import {
  FEEDBACK_TYPE_COLORS,
  FEEDBACK_TYPE_BG_COLORS,
  FEEDBACK_TYPE_TEXT_COLORS,
  FEEDBACK_TYPE_LABELS,
} from '@/lib/constants';

interface FeedbackTypeBadgeProps {
  type: string;
  className?: string;
}

export function FeedbackTypeBadge({ type, className = '' }: FeedbackTypeBadgeProps) {
  const key = type as keyof typeof FEEDBACK_TYPE_COLORS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: FEEDBACK_TYPE_BG_COLORS[key] ?? 'rgba(136,135,128,.12)',
        color: FEEDBACK_TYPE_TEXT_COLORS[key] ?? '#444441',
      }}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: FEEDBACK_TYPE_COLORS[key] ?? '#888780' }}
      />
      {FEEDBACK_TYPE_LABELS[key] ?? type}
    </span>
  );
}
