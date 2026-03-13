'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useUIStore } from '@/lib/stores/ui-store';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { FilterBar } from '@/components/layout/filter-bar';
import { BoardView } from '@/components/board/board-view';
import { ListView } from '@/components/list/list-view';
import { TimelineView } from '@/components/timeline/timeline-view';
import { TaskDetailPanel } from '@/components/task/task-detail-panel';
import { TaskCreateModal } from '@/components/task/task-create-modal';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { NotificationInbox } from '@/components/notifications/notification-inbox';
import { QuickActionPopover } from '@/components/shared/quick-action-popover';
import { SettingsModal } from '@/components/settings/settings-modal';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

export default function AppPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const {
    activeView,
    activeProjectId,
    detailPanelOpen,
    setCreateModalOpen,
    inboxOpen,
    setInboxOpen,
    activeFilters,
    activeSort,
  } = useUIStore();
  const { setUnreadCount } = useNotificationStore();
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null>(null);

  // Auth check
  const supabase = createBrowserSupabaseClient();
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [supabase, router]);

  // Get workspace
  const { data: workspace } = trpc.workspace.getCurrent.useQuery();
  const workspaceId = workspace?.id || '';

  // Get members
  const { data: members = [] } = trpc.workspace.getMembers.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Get labels
  const { data: labels = [] } = trpc.workspace.getLabels.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Get projects
  const { data: projects = [] } = trpc.projects.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Get tasks (with filters applied)
  const { data: taskData, refetch: refetchTasks } = trpc.tasks.list.useQuery(
    {
      workspaceId,
      projectId: activeProjectId || undefined,
      limit: 200,
      ...(activeFilters.status?.length ? { status: activeFilters.status as ('BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED')[] } : {}),
      ...(activeFilters.priority?.length ? { priority: activeFilters.priority as ('URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE')[] } : {}),
      ...(activeFilters.assigneeId?.length ? { assigneeId: activeFilters.assigneeId } : {}),
      ...(activeFilters.labelId?.length ? { labelId: activeFilters.labelId } : {}),
      ...(activeFilters.isBlocked !== undefined ? { isBlocked: activeFilters.isBlocked } : {}),
      ...(activeSort ? { sortField: activeSort.field, sortDirection: activeSort.direction as 'asc' | 'desc' } : {}),
    },
    { enabled: !!workspaceId }
  );
  const tasks = taskData?.tasks || [];

  // Keyboard shortcuts (pass tasks for J/K/Enter/P/A/D/L/E/X)
  useKeyboardShortcuts(tasks);

  // Get saved views
  const { data: savedViews = [] } = trpc.views.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Unread notifications count
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (unreadCount !== undefined) setUnreadCount(unreadCount);
  }, [unreadCount, setUnreadCount]);

  // Set current user from members
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const member = members.find((m) => m.id === session.user.id);
        if (member) {
          setCurrentUser({
            id: member.id,
            name: member.name,
            avatarUrl: member.avatarUrl,
            avatarColor: member.avatarColor,
          });
        }
      }
    };
    if (members.length > 0) fetchUser();
  }, [members, supabase]);

  // Task update handler
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => refetchTasks(),
  });

  const handleTaskUpdate = (taskId: string, field: string, value: unknown) => {
    updateTask.mutate({ id: taskId, [field]: value });
  };

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateTask.mutate({ id: taskId, status: newStatus as 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED' });
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectName = activeProject?.name || workspace?.name || 'House Money';

  if (!workspaceId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Sidebar
        projects={projects}
        savedViews={savedViews}
        currentUser={currentUser}
        workspaceSlug={workspace?.slug || 'house-money'}
        workspaceId={workspaceId}
        onProjectsChange={() => utils.projects.list.invalidate({ workspaceId })}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar projectName={projectName} onNewTask={() => setCreateModalOpen(true)} />
        <FilterBar members={members} labels={labels} />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeView === 'board' && (
              <BoardView
                tasks={tasks}
                onStatusChange={handleStatusChange}
                members={members}
              />
            )}

            {activeView === 'list' && (
              <ListView tasks={tasks} onTaskUpdate={handleTaskUpdate} />
            )}

            {activeView === 'timeline' && (
              <TimelineView tasks={tasks} onTaskUpdate={handleTaskUpdate} />
            )}
          </div>

          {detailPanelOpen && (
            <TaskDetailPanel
              onUpdate={handleTaskUpdate}
              members={members}
              workspaceId={workspaceId}
            />
          )}
        </div>

        {inboxOpen && (
          <div className="fixed inset-0 z-30 bg-white dark:bg-zinc-950 md:static md:inset-auto md:z-auto">
            <NotificationInbox onClose={() => setInboxOpen(false)} />
          </div>
        )}
      </div>

      <TaskCreateModal
        workspaceId={workspaceId}
        projectId={activeProjectId}
        projects={projects}
        members={members}
        labels={labels}
        onCreated={() => refetchTasks()}
      />

      <CommandPalette
        workspaceId={workspaceId}
        projects={projects}
        members={members}
        labels={labels}
        onTaskCreated={() => refetchTasks()}
      />
      <QuickActionPopover members={members} labels={labels} onUpdate={handleTaskUpdate} />
      <SettingsModal workspaceId={workspaceId} />
    </>
  );
}
