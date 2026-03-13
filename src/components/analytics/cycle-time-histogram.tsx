'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';
import { useDarkMode } from './use-dark-mode';
import { BRAND_AMBER } from '@/lib/constants';

interface CycleTimeBucket {
  label: string;
  count: number;
}

interface CycleTimeResult {
  medianHours: number | null;
  avgHours: number | null;
  histogram: CycleTimeBucket[];
  tasks: Array<{
    taskId: string;
    identifier: string;
    title: string;
    cycleHours: number;
  }>;
}

interface CycleTimeHistogramProps {
  data: CycleTimeResult | undefined;
  loading: boolean;
}

function formatHours(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}

export function CycleTimeHistogram({ data, loading }: CycleTimeHistogramProps) {
  const [mounted, setMounted] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  const hasData = data && data.histogram.some((b) => b.count > 0);

  return (
    <ChartCard
      title="Cycle Time"
      subtitle="Time from In Progress → Done"
      action={
        hasData && data.tasks.length > 0 ? (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            {showTable ? 'Show chart' : 'Slowest tasks'}
          </button>
        ) : undefined
      }
    >
      {/* Stat callouts */}
      {mounted && hasData && (
        <div className="mb-3 flex gap-4">
          <div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Median</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {data.medianHours != null ? formatHours(data.medianHours) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Average</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {data.avgHours != null ? formatHours(data.avgHours) : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="h-[176px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !hasData ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No cycle time data yet — tasks need to move through In Progress → Done
          </div>
        ) : showTable ? (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400 dark:text-zinc-500">
                  <th className="pb-1.5 font-medium">Task</th>
                  <th className="pb-1.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks
                  .slice()
                  .sort((a, b) => b.cycleHours - a.cycleHours)
                  .map((t) => (
                    <tr
                      key={t.taskId}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2">
                        <span className="text-zinc-400 dark:text-zinc-500">{t.identifier}</span>{' '}
                        <span className="text-zinc-700 dark:text-zinc-300 line-clamp-1">{t.title}</span>
                      </td>
                      <td className="py-1 text-right font-medium text-zinc-900 dark:text-zinc-100">
                        {formatHours(t.cycleHours)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.histogram}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: axisColor }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="count"
                name="Tasks"
                fill={BRAND_AMBER}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}
