'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { Sidebar } from '@/components/layout/sidebar';
import { DocsTopbar } from '@/components/docs/docs-topbar';
import { DocsListPanel } from '@/components/docs/docs-list-panel';
import { DocEditorPanel } from '@/components/docs/doc-editor-panel';
import { useDocsStore } from '@/lib/stores/docs-store';

export default function DocsPage() {
  const router = useRouter();
  const { setUnreadCount } = useNotificationStore();
  const { docsView } = useDocsStore();

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  } | null>(null);

  const supabase = createBrowserSupabaseClient();
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

  const sidebarProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status,
    progress: (p as { progress?: number }).progress ?? 0,
    isPrivate: p.isPrivate,
  }));

  const editorProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
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
      />

      <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <DocsTopbar workspaceId={workspaceId} />

        <div className="flex flex-1 overflow-hidden">
          {/* List panel — hidden when in AI query mode (no doc to select) */}
          {docsView === 'editor' && (
            <DocsListPanel workspaceId={workspaceId} />
          )}

          {/* Editor or AI panel */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <DocEditorPanel workspaceId={workspaceId} projects={editorProjects} />
          </div>
        </div>
      </div>
    </>
  );
}
