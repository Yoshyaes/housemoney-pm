'use client';

interface LabelChipProps {
  name: string;
  color: string;
  bgColor: string;
  className?: string;
}

export function LabelChip({ name, color, bgColor, className = '' }: LabelChipProps) {
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-px text-[9px] font-medium ${className}`}
      style={{ backgroundColor: bgColor, color }}
    >
      {name}
    </span>
  );
}
