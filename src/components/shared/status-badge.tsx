'use client';

import { STATUS_BG_COLORS, STATUS_TEXT_COLORS, STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({ status, showDot = false, className = '' }: StatusBadgeProps) {
  const key = status as keyof typeof STATUS_BG_COLORS;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: STATUS_BG_COLORS[key] || STATUS_BG_COLORS.BACKLOG,
        color: STATUS_TEXT_COLORS[key] || STATUS_TEXT_COLORS.BACKLOG,
      }}
    >
      {showDot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[key] || STATUS_COLORS.BACKLOG }}
        />
      )}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function StatusDot({ status, className = '' }: { status: string; className?: string }) {
  const key = status as keyof typeof STATUS_COLORS;
  return (
    <span
      className={`inline-block h-[7px] w-[7px] rounded-full ${className}`}
      style={{ backgroundColor: STATUS_COLORS[key] || STATUS_COLORS.BACKLOG }}
    />
  );
}
