'use client';

import { useState } from 'react';
import { StatusDot } from '@/components/shared/status-badge';
import { trpc } from '@/lib/trpc';
import { X, Plus, Search } from 'lucide-react';
import Fuse from 'fuse.js';

interface DependencyListProps {
  task: {
    id: string;
    identifier: string;
    blocking: Array<{
      id: string;
      blockedTask: { id: string; identifier: string; title: string; status: string };
    }>;
    blockedBy: Array<{
      id: string;
      blockingTask: { id: string; identifier: string; title: string; status: string };
    }>;
  };
  onUpdate: () => void;
  workspaceId: string;
}

export function DependencyList({ task, onUpdate, workspaceId }: DependencyListProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [relationType, setRelationType] = useState<'blocks' | 'blockedBy'>('blockedBy');

  const { data: allTasks } = trpc.tasks.list.useQuery(
    { workspaceId, limit: 200 },
    { enabled: showSearch }
  );

  const addDep = trpc.dependencies.add.useMutation({ onSuccess: () => { onUpdate(); setShowSearch(false); setSearchQuery(''); } });
  const removeDep = trpc.dependencies.remove.useMutation({ onSuccess: onUpdate });

  const searchableTasks = (allTasks?.tasks || []).filter((t) => t.id !== task.id);
  const fuse = new Fuse(searchableTasks, { keys: ['title', 'identifier'], threshold: 0.4 });
  const searchResults = searchQuery ? fuse.search(searchQuery).map((r) => r.item).slice(0, 5) : searchableTasks.slice(0, 5);

  const handleAdd = (targetTaskId: string) => {
    if (relationType === 'blocks') {
      addDep.mutate({ blockingTaskId: task.id, blockedTaskId: targetTaskId });
    } else {
      addDep.mutate({ blockingTaskId: targetTaskId, blockedTaskId: task.id });
    }
  };

  const hasAny = task.blocking.length > 0 || task.blockedBy.length > 0;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Dependencies</span>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Blocks */}
      {task.blocking.map((dep) => (
        <div key={dep.id} className="mb-1.5 flex items-center gap-2 rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] dark:border-zinc-800">
          <span className="rounded-full px-1.5 py-px text-[9px]" style={{ backgroundColor: 'rgba(226,75,74,.12)', color: '#A32D2D' }}>
            blocks
          </span>
          <span className="text-zinc-400 dark:text-zinc-500">{dep.blockedTask.identifier}</span>
          <span className="flex-1 truncate text-zinc-900 dark:text-zinc-100">{dep.blockedTask.title}</span>
          <button onClick={() => removeDep.mutate({ id: dep.id })} className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* Blocked by */}
      {task.blockedBy.map((dep) => (
        <div key={dep.id} className="mb-1.5 flex items-center gap-2 rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] dark:border-zinc-800">
          <span className="rounded-full px-1.5 py-px text-[9px]" style={{ backgroundColor: 'rgba(239,159,39,.12)', color: '#854F0B' }}>
            blocked by
          </span>
          <span className="text-zinc-400 dark:text-zinc-500">{dep.blockingTask.identifier}</span>
          <span className="flex-1 truncate text-zinc-900 dark:text-zinc-100">{dep.blockingTask.title}</span>
          <button onClick={() => removeDep.mutate({ id: dep.id })} className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {!hasAny && !showSearch && (
        <div className="py-1 text-[11px] text-zinc-400 dark:text-zinc-500">No dependencies</div>
      )}

      {/* Search to add */}
      {showSearch && (
        <div className="mt-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
          <div className="mb-2 flex gap-2">
            <button
              onClick={() => setRelationType('blockedBy')}
              className={`rounded-full px-2 py-0.5 text-[10px] ${relationType === 'blockedBy' ? 'bg-amber-50 text-amber-700' : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              Blocked by
            </button>
            <button
              onClick={() => setRelationType('blocks')}
              className={`rounded-full px-2 py-0.5 text-[10px] ${relationType === 'blocks' ? 'bg-amber-50 text-amber-700' : 'text-zinc-400 dark:text-zinc-500'}`}
            >
              Blocks
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded border border-zinc-200 bg-white py-1.5 pl-7 pr-2 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-900"
              autoFocus
            />
          </div>

          <div className="mt-1 max-h-32 overflow-y-auto">
            {searchResults.map((t) => (
              <button
                key={t.id}
                onClick={() => handleAdd(t.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <StatusDot status={t.status} />
                <span className="text-zinc-400 dark:text-zinc-500">{t.identifier}</span>
                <span className="truncate text-zinc-700 dark:text-zinc-300">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
