'use client';

import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants';

interface PriorityIndicatorProps {
  priority: string;
  showLabel?: boolean;
  className?: string;
}

export function PriorityIndicator({ priority, showLabel = true, className = '' }: PriorityIndicatorProps) {
  const key = priority as keyof typeof PRIORITY_COLORS;
  const color = PRIORITY_COLORS[key] || PRIORITY_COLORS.NONE;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${className}`} style={{ color }}>
      {priority === 'URGENT' && '▲'}
      {priority === 'HIGH' && '▲'}
      {priority === 'MEDIUM' && '■'}
      {priority === 'LOW' && '▼'}
      {showLabel && (PRIORITY_LABELS[priority] || priority)}
    </span>
  );
}

export function PriorityDot({ priority, className = '' }: { priority: string; className?: string }) {
  const key = priority as keyof typeof PRIORITY_COLORS;
  return (
    <span
      className={`inline-block h-[7px] w-[7px] rounded-full ${className}`}
      style={{ backgroundColor: PRIORITY_COLORS[key] || PRIORITY_COLORS.NONE }}
    />
  );
}
