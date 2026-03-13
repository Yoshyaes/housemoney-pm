'use client';

interface TooltipEntry {
  color?: string;
  name?: string | number;
  value?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      {label !== undefined && label !== '' && (
        <p className="mb-1.5 font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-zinc-500 dark:text-zinc-400">{p.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
