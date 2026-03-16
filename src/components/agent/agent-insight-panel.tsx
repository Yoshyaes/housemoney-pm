'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAgentStore } from '@/lib/stores/agent-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { formatRelativeTime } from '@/lib/utils';
import {
  Clock,
  AlertTriangle,
  GitBranch,
  Users,
  Copy,
  Scissors,
  FileText,
  BarChart2,
  Sparkles,
  Check,
  X,
  Undo2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const INSIGHT_ICONS: Record<string, typeof Clock> = {
  STALE_TASK: Clock,
  OVERDUE_ESCALATION: AlertTriangle,
  DEPENDENCY_UNBLOCKED: GitBranch,
  WORKLOAD_IMBALANCE: Users,
  DUPLICATE_DETECTED: Copy,
  DECOMPOSITION_SUGGESTED: Scissors,
  MEETING_ACTION_ITEMS: FileText,
  PROJECT_HEALTH_ALERT: BarChart2,
  DAILY_DIGEST: Sparkles,
};

const INSIGHT_COLORS: Record<string, string> = {
  STALE_TASK: 'text-amber-500',
  OVERDUE_ESCALATION: 'text-red-500',
  DEPENDENCY_UNBLOCKED: 'text-green-500',
  WORKLOAD_IMBALANCE: 'text-purple-500',
  DUPLICATE_DETECTED: 'text-orange-500',
  DECOMPOSITION_SUGGESTED: 'text-blue-500',
  MEETING_ACTION_ITEMS: 'text-teal-500',
  PROJECT_HEALTH_ALERT: 'text-red-400',
  DAILY_DIGEST: 'text-amber-400',
};

interface AgentInsightPanelProps {
  workspaceId: string;
  onClose: () => void;
}

export function AgentInsightPanel({ workspaceId, onClose }: AgentInsightPanelProps) {
  const [filter, setFilter] = useState<'PENDING' | 'ACCEPTED' | 'DISMISSED'>('PENDING');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { setPendingInsightCount } = useAgentStore();
  const { openTaskDetail } = useUIStore();

  const { data, refetch } = trpc.agent.getInsights.useQuery({
    workspaceId,
    status: filter,
  });

  const countQuery = trpc.agent.pendingCount.useQuery({ workspaceId });

  useEffect(() => {
    if (countQuery.data !== undefined) {
      setPendingInsightCount(countQuery.data);
    }
  }, [countQuery.data, setPendingInsightCount]);

  const acceptInsight = trpc.agent.acceptInsight.useMutation({
    onSuccess: () => {
      refetch();
      countQuery.refetch();
    },
  });

  const dismissInsight = trpc.agent.dismissInsight.useMutation({
    onSuccess: () => {
      refetch();
      countQuery.refetch();
    },
  });

  const revertInsight = trpc.agent.revertInsight.useMutation({
    onSuccess: () => {
      refetch();
      countQuery.refetch();
    },
  });

  const insights = data?.insights || [];

  const tabs = [
    { id: 'PENDING' as const, label: 'Pending' },
    { id: 'ACCEPTED' as const, label: 'Accepted' },
    { id: 'DISMISSED' as const, label: 'Dismissed' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">AI Insights</h2>
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-200/60 px-4 py-2 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              filter === tab.id
                ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {insights.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
            <Sparkles className="mb-2 h-8 w-8" />
            <span className="text-xs">
              {filter === 'PENDING' ? 'No pending insights' : `No ${filter.toLowerCase()} insights`}
            </span>
          </div>
        )}

        {insights.map((insight) => {
          const Icon = INSIGHT_ICONS[insight.type] || Sparkles;
          const colorClass = INSIGHT_COLORS[insight.type] || 'text-zinc-400';
          const isExpanded = expandedId === insight.id;

          return (
            <div
              key={insight.id}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <div
                className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                onClick={() => setExpandedId(isExpanded ? null : insight.id)}
              >
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${colorClass}`} />

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {insight.title}
                  </div>
                  {insight.task && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openTaskDetail(insight.task!.id);
                        onClose();
                      }}
                      className="mt-0.5 text-[10px] text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      {insight.task.identifier} · {insight.task.title}
                    </button>
                  )}
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                    <span>{formatRelativeTime(insight.createdAt)}</span>
                    {insight.confidence > 0.8 && (
                      <span className="rounded bg-green-50 px-1 py-px text-green-600 dark:bg-green-900/30 dark:text-green-400">
                        high confidence
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div
                    className="prose prose-xs max-w-none text-xs text-zinc-600 dark:text-zinc-400"
                    dangerouslySetInnerHTML={{
                      __html: insight.body
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br />'),
                    }}
                  />

                  {filter === 'PENDING' && (
                    <div className="mt-3 flex items-center gap-2">
                      {insight.proposedAction && (
                        <button
                          onClick={() => acceptInsight.mutate({ id: insight.id })}
                          disabled={acceptInsight.isPending}
                          className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          Accept
                        </button>
                      )}
                      <button
                        onClick={() => dismissInsight.mutate({ id: insight.id })}
                        disabled={dismissInsight.isPending}
                        className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Dismiss
                      </button>
                    </div>
                  )}

                  {(filter === 'ACCEPTED') && insight.proposedAction && (
                    <div className="mt-3">
                      <button
                        onClick={() => revertInsight.mutate({ id: insight.id })}
                        disabled={revertInsight.isPending}
                        className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-50"
                      >
                        <Undo2 className="h-3 w-3" />
                        Revert
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
