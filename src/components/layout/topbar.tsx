'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { BRAND_AMBER } from '@/lib/constants';
import { ChevronDown, FolderOpen, Layers, Menu, Plus, Check } from 'lucide-react';

interface TopbarProject {
  id: string;
  name: string;
  color: string;
}

interface TopbarProps {
  workspaceName: string;
  activeProjectName?: string | null;
  projects: TopbarProject[];
  onNewTask: () => void;
}

export function Topbar({ workspaceName, activeProjectName, projects, onNewTask }: TopbarProps) {
  const { activeView, setActiveView, setMobileSidebarOpen, activeProjectId, setActiveProjectId } = useUIStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  const viewTabs = [
    { id: 'board' as const, label: 'Board' },
    { id: 'list' as const, label: 'List' },
    { id: 'timeline' as const, label: 'Timeline' },
  ];

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-200/60 dark:border-zinc-800 px-3 py-2.5 md:gap-2.5 md:px-4">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Project switcher breadcrumb */}
      <div ref={switcherRef} className="relative">
        <button
          onClick={() => setSwitcherOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <FolderOpen className="hidden h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 md:block" />
          {activeProjectName ? (
            <>
              <span className="hidden truncate text-sm text-zinc-500 dark:text-zinc-400 md:inline">{workspaceName}</span>
              <span className="hidden text-zinc-300 dark:text-zinc-600 md:inline">/</span>
              <span
                className="inline-flex max-w-[160px] items-center truncate rounded-md px-1.5 py-0.5 text-sm font-medium"
                style={{ backgroundColor: 'rgba(186,117,23,0.12)', color: BRAND_AMBER }}
              >
                <span className="truncate">{activeProjectName}</span>
              </span>
            </>
          ) : (
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{workspaceName}</span>
          )}
          <ChevronDown className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
        </button>

        {switcherOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg">
            <button
              onClick={() => { setActiveProjectId(null); setSwitcherOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Layers className="h-3 w-3 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
              <span className="flex-1 truncate text-left text-zinc-700 dark:text-zinc-300">All tasks</span>
              {activeProjectId === null && <Check className="h-3 w-3 text-zinc-400" />}
            </button>
            {projects.length > 0 && <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setActiveProjectId(p.id); setSwitcherOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="flex-1 truncate text-left text-zinc-700 dark:text-zinc-300">{p.name}</span>
                {activeProjectId === p.id && <Check className="h-3 w-3 text-zinc-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-px rounded-md bg-zinc-100 dark:bg-zinc-800 p-0.5">
        {viewTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`rounded-[5px] px-2 py-1 text-[11px] transition-colors md:px-2.5 md:text-xs ${
              activeView === tab.id
                ? 'bg-white dark:bg-zinc-900 font-medium text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <button
        onClick={onNewTask}
        className="ml-auto rounded-md border px-3 py-1 text-xs font-medium transition-colors hover:text-white max-sm:hidden"
        style={{
          borderColor: BRAND_AMBER,
          color: BRAND_AMBER,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = BRAND_AMBER;
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = BRAND_AMBER;
        }}
      >
        + New task
      </button>

      {/* Mobile new task button (compact) */}
      <button
        onClick={onNewTask}
        className="ml-auto flex h-7 w-7 items-center justify-center rounded-md sm:hidden"
        style={{ backgroundColor: BRAND_AMBER, color: '#fff' }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
