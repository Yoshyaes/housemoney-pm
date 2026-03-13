'use client';

import { format } from 'date-fns';
import { ChartCard } from './chart-card';

interface ProjectHealthRow {
  projectId: string;
  name: string;
  color: string;
  status: string;
  total: number;
  done: number;
  open: number;
  overdue: number;
  blocked: number;
  progress: number;
  targetDate: Date | null;
}

interface ProjectHealthTableProps {
  data: ProjectHealthRow[] | undefined;
  loading: boolean;
}

export function ProjectHealthTable({ data, loading }: ProjectHealthTableProps) {
  if (loading) {
    return (
      <ChartCard title="Project Health" subtitle="Per-project status rollup">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      </ChartCard>
    );
  }

  if (!data?.length) {
    return (
      <ChartCard title="Project Health" subtitle="Per-project status rollup">
        <div className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          No projects yet
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Project Health" subtitle="Per-project status rollup">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
              <th className="pb-2 font-medium">Project</th>
              <th className="pb-2 font-medium">Progress</th>
              <th className="pb-2 text-center font-medium">Total</th>
              <th className="pb-2 text-center font-medium">Done</th>
              <th className="pb-2 text-center font-medium">Open</th>
              <th className="pb-2 text-center font-medium">Overdue</th>
              <th className="pb-2 text-center font-medium">Blocked</th>
              <th className="pb-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const isTargetOverdue =
                p.targetDate && p.targetDate < new Date() && p.status !== 'COMPLETED';

              return (
                <tr
                  key={p.projectId}
                  className="border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                >
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[120px]">
                        {p.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {p.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-center text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {p.total}
                  </td>
                  <td className="py-2 text-center text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {p.done}
                  </td>
                  <td className="py-2 text-center text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {p.open}
                  </td>
                  <td className="py-2 text-center tabular-nums">
                    <span
                      className={
                        p.overdue > 0
                          ? 'font-medium text-red-600 dark:text-red-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }
                    >
                      {p.overdue}
                    </span>
                  </td>
                  <td className="py-2 text-center tabular-nums">
                    <span
                      className={
                        p.blocked > 0
                          ? 'font-medium text-amber-600 dark:text-amber-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }
                    >
                      {p.blocked}
                    </span>
                  </td>
                  <td className="py-2">
                    {p.targetDate ? (
                      <span
                        className={
                          isTargetOverdue
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }
                      >
                        {format(new Date(p.targetDate), 'MMM d')}
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
