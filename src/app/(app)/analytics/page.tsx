'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useCurrentMembership } from '@/lib/hooks/use-current-membership';
import { Sidebar } from '@/components/layout/sidebar';
import { AnalyticsTopbar } from '@/components/analytics/analytics-topbar';
import { SummaryCards } from '@/components/analytics/summary-cards';
import { ThroughputChart } from '@/components/analytics/throughput-chart';
import { CumulativeFlowChart } from '@/components/analytics/cumulative-flow-chart';
import { CycleTimeHistogram } from '@/components/analytics/cycle-time-histogram';
import { WorkloadChart } from '@/components/analytics/workload-chart';
import { StatusDistributionChart } from '@/components/analytics/status-distribution-chart';
import { PriorityDistributionChart } from '@/components/analytics/priority-distribution-chart';
import { ProjectHealthTable } from '@/components/analytics/project-health-table';

type DateRange = '7d' | '30d' | '90d' | 'all';

export default function AnalyticsPage() {
  const router = useRouter();
  const { setUnreadCount } = useNotificationStore();

  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  } | null>(null);

  // Auth check
  const supabase = createBrowserSupabaseClient();
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [supabase, router]);

  const { data: workspace } = trpc.workspace.getCurrent.useQuery();
  const workspaceId = workspace?.id ?? '';

  const { data: members = [] } = trpc.workspace.getMembers.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data: projects = [] } = trpc.projects.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data: savedViews = [] } = trpc.views.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!workspaceId,
  });
  useEffect(() => {
    if (unreadCount !== undefined) setUnreadCount(unreadCount);
  }, [unreadCount, setUnreadCount]);

  // Set current user
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const member = members.find((m) => m.id === session.user.id);
        if (member) {
          setCurrentUser({
            id: member.id,
            name: member.name,
            avatarUrl: member.avatarUrl,
            avatarColor: member.avatarColor ?? undefined,
          });
        }
      }
    };
    if (members.length > 0) fetchUser();
  }, [members, supabase]);

  // Redirect guests away from analytics
  const { isGuest } = useCurrentMembership(members, currentUser?.id);
  useEffect(() => {
    if (isGuest) router.push('/');
  }, [isGuest, router]);

  // Block render for guests
  if (isGuest) return null;

  // Analytics queries — all share the same input, 5-minute stale time
  const commonInput = {
    workspaceId,
    dateRange,
    projectId: projectId ?? undefined,
  };
  const queryOpts = { enabled: !!workspaceId, staleTime: 5 * 60 * 1000 };

  const { data: summary, isLoading: summaryLoading } =
    trpc.analytics.summary.useQuery(commonInput, queryOpts);

  const { data: throughput, isLoading: throughputLoading } =
    trpc.analytics.throughput.useQuery(commonInput, queryOpts);

  const { data: cycleTime, isLoading: cycleTimeLoading } =
    trpc.analytics.cycleTime.useQuery(commonInput, queryOpts);

  const { data: statusDist, isLoading: statusDistLoading } =
    trpc.analytics.statusDistribution.useQuery(commonInput, queryOpts);

  const { data: priorityDist, isLoading: priorityDistLoading } =
    trpc.analytics.priorityDistribution.useQuery(commonInput, queryOpts);

  const { data: workload, isLoading: workloadLoading } =
    trpc.analytics.workloadByAssignee.useQuery(commonInput, queryOpts);

  const { data: cfd, isLoading: cfdLoading } =
    trpc.analytics.cumulativeFlow.useQuery(commonInput, queryOpts);

  const { data: projectHealth, isLoading: projectHealthLoading } =
    trpc.analytics.projectHealth.useQuery(
      { workspaceId },
      { enabled: !!workspaceId, staleTime: 5 * 60 * 1000 }
    );

  const sidebarProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status,
    progress: (p as { progress?: number }).progress ?? 0,
    isPrivate: p.isPrivate,
  }));

  return (
    <>
      <Sidebar
        projects={sidebarProjects}
        savedViews={savedViews}
        currentUser={currentUser}
        workspaceSlug="house-money"
        workspaceId={workspaceId}
        onProjectsChange={() => {}}
        isGuest={isGuest}
      />

      <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <AnalyticsTopbar
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          projectId={projectId}
          onProjectChange={setProjectId}
          projects={sidebarProjects}
        />

        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto max-w-6xl space-y-4">
            {/* KPI summary row */}
            <SummaryCards data={summary} loading={summaryLoading} />

            {/* Trend charts */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ThroughputChart data={throughput} loading={throughputLoading} />
              <CumulativeFlowChart data={cfd} loading={cfdLoading} />
            </div>

            {/* Cycle time + workload */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CycleTimeHistogram data={cycleTime} loading={cycleTimeLoading} />
              <WorkloadChart data={workload} loading={workloadLoading} />
            </div>

            {/* Distribution charts */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <StatusDistributionChart data={statusDist} loading={statusDistLoading} />
              <PriorityDistributionChart data={priorityDist} loading={priorityDistLoading} />
            </div>

            {/* Project health */}
            <ProjectHealthTable data={projectHealth} loading={projectHealthLoading} />
          </div>
        </main>
      </div>
    </>
  );
}
