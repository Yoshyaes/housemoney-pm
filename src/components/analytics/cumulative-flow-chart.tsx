'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';
import { useDarkMode } from './use-dark-mode';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';

interface CfdPoint {
  date: string;
  BACKLOG: number;
  TODO: number;
  IN_PROGRESS: number;
  IN_REVIEW: number;
  DONE: number;
  CANCELLED: number;
}

interface CumulativeFlowChartProps {
  data: CfdPoint[] | undefined;
  loading: boolean;
}

const STATUSES = ['DONE', 'IN_REVIEW', 'IN_PROGRESS', 'TODO', 'BACKLOG'] as const;

export function CumulativeFlowChart({ data, loading }: CumulativeFlowChartProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  // Sample data to avoid too many x-axis labels
  const displayData = data && data.length > 30
    ? data.filter((_, i) => i % Math.ceil(data.length / 30) === 0)
    : data;

  return (
    <ChartCard
      title="Cumulative Flow"
      subtitle="Task distribution over time — widening Done band = healthy velocity"
    >
      <div className="h-[220px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !displayData?.length ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No data in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              {STATUSES.map((status) => (
                <Area
                  key={status}
                  type="monotone"
                  dataKey={status}
                  name={STATUS_LABELS[status]}
                  stackId="1"
                  stroke={STATUS_COLORS[status]}
                  fill={STATUS_COLORS[status]}
                  fillOpacity={0.7}
                  strokeWidth={1}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {mounted && displayData?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: STATUS_COLORS[s] }}
              />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {STATUS_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </ChartCard>
  );
}
