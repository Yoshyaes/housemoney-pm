'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { ChartCard } from './chart-card';
import { ChartTooltip } from './chart-tooltip';
import { useDarkMode } from './use-dark-mode';
import { PRIORITY_COLORS, PRIORITY_LABELS, PRIORITY_ORDER } from '@/lib/constants';

interface PriorityDistributionPoint {
  priority: string;
  count: number;
}

interface PriorityDistributionChartProps {
  data: PriorityDistributionPoint[] | undefined;
  loading: boolean;
}

export function PriorityDistributionChart({ data, loading }: PriorityDistributionChartProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  const displayData = data
    ? PRIORITY_ORDER.map((p) => ({
        priority: p,
        label: PRIORITY_LABELS[p] ?? p,
        count: data.find((d) => d.priority === p)?.count ?? 0,
      })).filter((d) => d.count > 0)
    : [];

  return (
    <ChartCard title="Priority Breakdown" subtitle="Open tasks by priority">
      <div className="h-[200px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !displayData.length ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No open tasks
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
              <Bar dataKey="count" name="Tasks" radius={[3, 3, 0, 0]}>
                {displayData.map((entry) => (
                  <Cell
                    key={entry.priority}
                    fill={PRIORITY_COLORS[entry.priority as keyof typeof PRIORITY_COLORS] ?? '#888780'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}
