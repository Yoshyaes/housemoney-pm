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
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from '@/lib/constants';

interface StatusDistributionPoint {
  status: string;
  count: number;
}

interface StatusDistributionChartProps {
  data: StatusDistributionPoint[] | undefined;
  loading: boolean;
}

export function StatusDistributionChart({ data, loading }: StatusDistributionChartProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  // Sort by STATUS_ORDER and add labels
  const displayData = data
    ? STATUS_ORDER.map((s) => ({
        status: s,
        label: STATUS_LABELS[s] ?? s,
        count: data.find((d) => d.status === s)?.count ?? 0,
      })).filter((d) => d.count > 0)
    : [];

  return (
    <ChartCard title="Status Breakdown" subtitle="All tasks by current status">
      <div className="h-[200px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !displayData.length ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No tasks yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: axisColor }}
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
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] ?? '#888780'}
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
