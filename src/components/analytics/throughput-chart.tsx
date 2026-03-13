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
import { STATUS_COLORS } from '@/lib/constants';

interface ThroughputPoint {
  week: string;
  completed: number;
}

interface ThroughputChartProps {
  data: ThroughputPoint[] | undefined;
  loading: boolean;
}

export function ThroughputChart({ data, loading }: ThroughputChartProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  return (
    <ChartCard
      title="Throughput"
      subtitle="Tasks completed per week"
    >
      <div className="h-[220px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !data?.length ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No completed tasks in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={STATUS_COLORS.DONE} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={STATUS_COLORS.DONE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="week"
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
              <Area
                type="monotone"
                dataKey="completed"
                name="Completed"
                stroke={STATUS_COLORS.DONE}
                strokeWidth={2}
                fill="url(#throughputGradient)"
                dot={false}
                activeDot={{ r: 4, fill: STATUS_COLORS.DONE }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}
