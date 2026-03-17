'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { useDecisionsStore } from '@/lib/stores/decisions-store';
import { useCurrentMembership } from '@/lib/hooks/use-current-membership';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { Sidebar } from '@/components/layout/sidebar';
import { DecisionsTopbar } from '@/components/decisions/decisions-topbar';
import { DecisionsList } from '@/components/decisions/decisions-list';
import { DecisionDetailPanel } from '@/components/decisions/decision-detail-panel';
import { DecisionCreateModal } from '@/components/decisions/decision-create-modal';

export default function DecisionsPage() {
  const router = useRouter();
  const { setUnreadCount } = useNotificationStore();
  const { selectedDecisionId } = useDecisionsStore();

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  } | null>(null);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.push('/login');
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
            avatarColor: member.avatarColor ?? undefined,
          });
        }
      }
    };
    if (members.length > 0) fetchUser();
  }, [members, supabase]);

  const { isGuest, isAdmin } = useCurrentMembership(members, currentUser?.id);

  const sidebarProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status,
    progress: (p as { progress?: number }).progress ?? 0,
    isPrivate: p.isPrivate,
  }));

  const modalProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }));

  const membersList = members.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl,
    avatarColor: m.avatarColor,
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
        isAdmin={isAdmin}
      />

      <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <DecisionsTopbar isGuest={isGuest} />

        <div className="flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <DecisionsList workspaceId={workspaceId} />
          </div>

          {selectedDecisionId && (
            <DecisionDetailPanel
              workspaceId={workspaceId}
              currentUserId={currentUser?.id ?? null}
              isAdmin={isAdmin}
              members={membersList}
            />
          )}
        </div>
      </div>

      {!isGuest && (
        <DecisionCreateModal
          workspaceId={workspaceId}
          members={membersList}
          projects={modalProjects}
          currentUserId={currentUser?.id ?? ''}
        />
      )}
    </>
  );
}
