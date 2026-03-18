'use client';

interface ExperimentScoreBadgeProps {
  score: number | null | undefined;
  className?: string;
}

export function ExperimentScoreBadge({ score, className = '' }: ExperimentScoreBadgeProps) {
  const value = score ?? 0;

  let bgColor: string;
  let textColor: string;

  if (value >= 5) {
    bgColor = 'rgba(99,153,34,.12)';
    textColor = '#27500A';
  } else if (value >= 3) {
    bgColor = 'rgba(239,159,39,.12)';
    textColor = '#854F0B';
  } else {
    bgColor = 'rgba(226,75,74,.12)';
    textColor = '#A32D2D';
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${className}`}
      style={{ backgroundColor: bgColor, color: textColor }}
      title={value >= 5 ? 'Passes threshold (≥5/8)' : 'Below threshold (<5/8)'}
    >
      {value}/8
    </span>
  );
}
