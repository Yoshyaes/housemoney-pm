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
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';

interface AssigneeWorkload {
  userId: string;
  name: string;
  avatarColor: string | null;
  BACKLOG: number;
  TODO: number;
  IN_PROGRESS: number;
  IN_REVIEW: number;
  total: number;
}

interface WorkloadChartProps {
  data: AssigneeWorkload[] | undefined;
  loading: boolean;
}

const WORKLOAD_STATUSES = ['IN_PROGRESS', 'IN_REVIEW', 'TODO', 'BACKLOG'] as const;

export function WorkloadChart({ data, loading }: WorkloadChartProps) {
  const [mounted, setMounted] = useState(false);
  const isDark = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const axisColor = isDark ? '#52525b' : '#a1a1aa';

  // Use first name only for compact labels
  const displayData = data?.map((d) => ({
    ...d,
    shortName: d.name.split(' ')[0],
  }));

  return (
    <ChartCard
      title="Team Workload"
      subtitle="Open tasks per member by status"
    >
      <div className="h-[220px]">
        {!mounted || loading ? (
          <div className="h-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : !displayData?.length ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
            No assigned open tasks
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="shortName"
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
              {WORKLOAD_STATUSES.map((status, i) => (
                <Bar
                  key={status}
                  dataKey={status}
                  name={STATUS_LABELS[status]}
                  stackId="workload"
                  fill={STATUS_COLORS[status]}
                  radius={i === WORKLOAD_STATUSES.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {mounted && displayData?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {WORKLOAD_STATUSES.map((s) => (
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
