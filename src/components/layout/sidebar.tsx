'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui-store';
import type { ActiveFilters, ActiveSort } from '@/lib/stores/ui-store';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { BRAND_AMBER } from '@/lib/constants';
import { Avatar } from '@/components/shared/avatar';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { GuestBadge } from '@/components/shared/guest-badge';
import { ProjectMembers } from '@/components/project/project-members';
import { trpc } from '@/lib/trpc';
import {
  LayoutGrid,
  List,
  GanttChart,
  Inbox,
  Eye,
  Settings,
  X,
  Plus,
  BarChart2,
  BookOpen,
  Lock,
  Globe,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';

interface SavedView {
  id: string;
  name: string;
  filters?: unknown;
  sort?: unknown;
  displayType?: string;
  swimlaneBy?: string | null;
}

interface SidebarProps {
  projects: Array<{
    id: string;
    name: string;
    color: string;
    status: string;
    progress: number;
    isPrivate?: boolean;
  }>;
  savedViews: SavedView[];
  currentUser: {
    name: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  } | null;
  workspaceSlug: string;
  workspaceId: string;
  onProjectsChange: () => void;
  isGuest?: boolean;
}

export function Sidebar({ projects, savedViews, currentUser, workspaceId, onProjectsChange, isGuest = false }: SidebarProps) {
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectMenu, setProjectMenu] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [managingMembersProjectId, setManagingMembersProjectId] = useState<string | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate({ workspaceId }); onProjectsChange(); },
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate({ workspaceId }); onProjectsChange(); },
  });

  // Close project menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenu(null);
      }
    };
    if (projectMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectMenu]);
  const router = useRouter();
  const pathname = usePathname();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate({ workspaceId });
      onProjectsChange();
      setNewProjectName('');
      setAddingProject(false);
    },
  });
  const {
    activeView,
    setActiveView,
    activeProjectId,
    setActiveProjectId,
    inboxOpen,
    setInboxOpen,
    setActiveFilters,
    setActiveSort,
    setSwimlaneMode,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    setSettingsOpen,
  } = useUIStore();
  const { unreadCount } = useNotificationStore();

  const allNavItems = [
    { id: 'board' as const, label: 'Board', icon: LayoutGrid },
    { id: 'list' as const, label: 'List', icon: List },
    { id: 'timeline' as const, label: 'Timeline', icon: GanttChart },
    { id: 'inbox' as const, label: 'Inbox', icon: Inbox, badge: unreadCount },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart2, guestHidden: true },
    { id: 'docs' as const, label: 'Docs', icon: BookOpen },
  ];
  const navItems = isGuest ? allNavItems.filter((item) => !item.guestHidden) : allNavItems;

  const handleNavClick = (id: string) => {
    if (id === 'board' || id === 'list' || id === 'timeline') {
      setActiveView(id);
      setInboxOpen(false);
      if (pathname !== '/') router.push('/');
    } else if (id === 'inbox') {
      setInboxOpen(!inboxOpen);
      if (pathname !== '/') router.push('/');
    } else if (id === 'analytics') {
      router.push('/analytics');
    } else if (id === 'docs') {
      router.push('/docs');
    }
    setMobileSidebarOpen(false);
  };

  const handleViewClick = (view: SavedView) => {
    if (view.filters) {
      setActiveFilters(view.filters as ActiveFilters);
    }
    if (view.sort) {
      setActiveSort(view.sort as ActiveSort);
    }
    if (view.displayType === 'board' || view.displayType === 'list' || view.displayType === 'timeline') {
      setActiveView(view.displayType);
    }
    if (view.swimlaneBy) {
      setSwimlaneMode(view.swimlaneBy as 'assignee' | 'priority' | 'label' | 'none');
    }
    setMobileSidebarOpen(false);
  };

  const handleProjectClick = (projectId: string) => {
    setActiveProjectId(projectId === activeProjectId ? null : projectId);
    setMobileSidebarOpen(false);
    if (pathname !== '/') router.push('/');
  };

  const sidebarContent = (
    <aside className="flex h-full w-[248px] min-w-[248px] flex-col border-r border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-zinc-200/60 dark:border-zinc-800 px-3.5 py-3">
        <div
          className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] text-[11px] font-medium text-white"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          HM
        </div>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">House Money</span>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileSidebarOpen(false)}
          className="ml-auto rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 px-2 pt-2 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Workspace
        </div>

        {navItems.map((item) => {
          const isActive =
            item.id === 'analytics'
              ? pathname === '/analytics'
              : item.id === 'docs'
                ? pathname.startsWith('/docs')
                : item.id === 'inbox'
                  ? inboxOpen && pathname !== '/analytics' && !pathname.startsWith('/docs')
                  : item.id === 'board' || item.id === 'list' || item.id === 'timeline'
                    ? activeView === item.id && !inboxOpen && pathname !== '/analytics' && !pathname.startsWith('/docs')
                    : false;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-xs transition-colors ${
                isActive
                  ? 'bg-white dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {item.label}
              {item.badge && item.badge > 0 ? (
                <span
                  className="ml-auto flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px]"
                  style={{ backgroundColor: 'rgba(226,75,74,.12)', color: '#A32D2D' }}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}

        {/* Projects */}
        <div className="mb-1 mt-3 flex items-center px-2 pt-2">
          <span className="flex-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Projects</span>
          {!isGuest && (
            <button
              onClick={() => { setAddingProject(true); setNewProjectName(''); }}
              className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              title="New project"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        {projects.map((project) => (
          <div key={project.id} className="group relative">
            {renamingProject?.id === project.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renamingProject.name.trim()) {
                    updateProject.mutate({ id: project.id, name: renamingProject.name.trim() });
                  }
                  setRenamingProject(null);
                }}
                className="flex items-center gap-1 px-2 py-0.5"
              >
                <input
                  autoFocus
                  value={renamingProject.name}
                  onChange={(e) => setRenamingProject({ ...renamingProject, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Escape' && setRenamingProject(null)}
                  onBlur={() => { if (renamingProject.name.trim()) updateProject.mutate({ id: project.id, name: renamingProject.name.trim() }); setRenamingProject(null); }}
                  className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                />
              </form>
            ) : (
              <button
                onClick={() => handleProjectClick(project.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-xs transition-colors ${
                  activeProjectId === project.id
                    ? 'bg-white dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="flex-1 truncate text-left">{project.name}</span>
                {project.isPrivate && (
                  <Lock className="h-2.5 w-2.5 flex-shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:hidden" />
                )}
                {!isGuest && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setProjectMenu(projectMenu === project.id ? null : project.id); }}
                    className="hidden group-hover:flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                )}
              </button>
            )}

            {/* Project context menu */}
            {projectMenu === project.id && (
              <div
                ref={projectMenuRef}
                className="absolute left-1 top-full z-50 mt-0.5 w-44 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1 text-xs"
              >
                <button
                  onClick={() => { setRenamingProject({ id: project.id, name: project.name }); setProjectMenu(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Pencil className="h-3 w-3 text-zinc-400" />
                  Rename
                </button>
                <button
                  onClick={() => { setManagingMembersProjectId(project.id); setProjectMenu(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Users className="h-3 w-3 text-zinc-400" />
                  Manage members
                </button>
                <button
                  onClick={() => { updateProject.mutate({ id: project.id, isPrivate: !project.isPrivate }); setProjectMenu(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  {project.isPrivate
                    ? <Globe className="h-3 w-3 text-zinc-400" />
                    : <Lock className="h-3 w-3 text-zinc-400" />
                  }
                  {project.isPrivate ? 'Make public' : 'Make private'}
                </button>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  onClick={() => {
                    if (confirm(`Delete "${project.name}"? All tasks will be deleted.`)) {
                      deleteProject.mutate({ id: project.id });
                    }
                    setProjectMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete project
                </button>
              </div>
            )}
          </div>
        ))}
        {addingProject && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newProjectName.trim()) {
                createProject.mutate({ workspaceId, name: newProjectName.trim() });
              }
            }}
            className="mt-1 flex items-center gap-1 px-2"
          >
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAddingProject(false)}
              placeholder="Project name"
              className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
            />
            <button type="submit" disabled={!newProjectName.trim()} className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 disabled:opacity-40">
              <Plus className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => setAddingProject(false)} className="rounded p-0.5 text-zinc-400 hover:text-zinc-600">
              <X className="h-3 w-3" />
            </button>
          </form>
        )}

        {/* Saved Views */}
        {savedViews.length > 0 && (
          <>
            <div className="mb-1 mt-3 px-2 pt-2 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Saved views
            </div>
            {savedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => handleViewClick(view)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-xs text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                {view.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* User profile */}
      <div className="flex items-center gap-2 border-t border-zinc-200/60 dark:border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        {currentUser && (
          <>
            <Avatar
              name={currentUser.name}
              avatarUrl={currentUser.avatarUrl}
              avatarColor={currentUser.avatarColor}
              size="md"
            />
            <span>{currentUser.name}</span>
            {isGuest && <GuestBadge />}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {!isGuest && (
            <button onClick={() => setSettingsOpen(true)} className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebarContent}</div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Project members modal */}
      {managingMembersProjectId && (
        <ProjectMembers
          projectId={managingMembersProjectId}
          workspaceId={workspaceId}
          onClose={() => setManagingMembersProjectId(null)}
        />
      )}
    </>
  );
}
