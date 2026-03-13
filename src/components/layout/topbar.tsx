'use client';

import { useUIStore } from '@/lib/stores/ui-store';
import { BRAND_AMBER } from '@/lib/constants';
import { ChevronDown, FolderOpen, Menu, Plus } from 'lucide-react';

interface TopbarProps {
  projectName: string;
  onNewTask: () => void;
}

export function Topbar({ projectName, onNewTask }: TopbarProps) {
  const { activeView, setActiveView, setMobileSidebarOpen } = useUIStore();

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

      <FolderOpen className="hidden h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 md:block" />
      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{projectName}</span>
      <ChevronDown className="hidden h-3 w-3 text-zinc-400 dark:text-zinc-500 md:block" />

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
