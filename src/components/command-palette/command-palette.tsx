'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useUIStore } from '@/lib/stores/ui-store';
import { trpc } from '@/lib/trpc';
import { StatusDot } from '@/components/shared/status-badge';
import { highlightMatch } from '@/lib/utils/highlight';
import { LayoutGrid, List, Inbox, Plus, Search, ArrowRight, MessageSquare, FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { AITaskInput } from './ai-task-input';

interface CommandPaletteProps {
  workspaceId: string;
  projects: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string; color: string; bgColor: string }>;
  onTaskCreated: () => void;
}

export function CommandPalette({ workspaceId, projects, members, labels, onTaskCreated }: CommandPaletteProps) {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveView,
    setCreateModalOpen,
    openTaskDetail,
    setActiveProjectId,
  } = useUIStore();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [aiMode, setAiMode] = useState(false);

  // Debounce search input by 200ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: searchResults, isFetching } = trpc.search.global.useQuery(
    { workspaceId, query: debouncedSearch, limit: 5 },
    {
      enabled: commandPaletteOpen && debouncedSearch.length >= 1,
      placeholderData: (prev) => prev,
    }
  );

  useEffect(() => {
    if (!commandPaletteOpen) {
      setSearch('');
      setDebouncedSearch('');
      setAiMode(false);
    }
  }, [commandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const hasResults = searchResults && (
    searchResults.tasks.length > 0 ||
    searchResults.comments.length > 0 ||
    searchResults.projects.length > 0
  );

  const isSearching = debouncedSearch.length >= 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[20vh] md:px-0 md:pt-[15vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {aiMode ? (
          <AITaskInput
            workspaceId={workspaceId}
            projects={projects}
            members={members}
            labels={labels}
            onCreated={() => {
              setCommandPaletteOpen(false);
              onTaskCreated();
            }}
            onCancel={() => setAiMode(false)}
          />
        ) : (
        <Command shouldFilter={false}>
          <div className="flex items-center border-b border-zinc-100 px-3 dark:border-zinc-800">
            {isFetching && isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400 dark:text-zinc-500" />
            ) : (
              <Search className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            )}
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search tasks, comments, projects..."
              className="w-full border-none bg-white px-3 py-3 text-sm outline-none placeholder:text-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              autoFocus
            />
            <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">ESC</kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {/* Empty state when searching with no results */}
            {isSearching && !hasResults && !isFetching && (
              <Command.Empty className="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                No results found for &ldquo;{debouncedSearch}&rdquo;
              </Command.Empty>
            )}

            {/* Actions (shown when not searching) */}
            {!isSearching && (
              <Command.Group heading={<span className="px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Actions</span>}>
                <Command.Item
                  onSelect={() => { setCommandPaletteOpen(false); setCreateModalOpen(true); }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-700 data-[selected=true]:bg-zinc-100 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  Create new task
                  <kbd className="ml-auto rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">C</kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => setAiMode(true)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-700 data-[selected=true]:bg-zinc-100 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Create task with AI
                  <kbd className="ml-auto rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">AI</kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => { setCommandPaletteOpen(false); setActiveView('board'); }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-700 data-[selected=true]:bg-zinc-100 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  Go to Board
                  <kbd className="ml-auto rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">G B</kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => { setCommandPaletteOpen(false); setActiveView('list'); }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-700 data-[selected=true]:bg-zinc-100 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800"
                >
                  <List className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  Go to List
                  <kbd className="ml-auto rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">G L</kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => { setCommandPaletteOpen(false); }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-700 data-[selected=true]:bg-zinc-100 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800"
                >
                  <Inbox className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  Go to Inbox
                  <kbd className="ml-auto rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">G I</kbd>
                </Command.Item>
              </Command.Group>
            )}

            {/* Task results */}
            {isSearching && searchResults && searchResults.tasks.length > 0 && (
              <Command.Group heading={<span className="px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tasks</span>}>
                {searchResults.tasks.map((task) => (
                  <Command.Item
                    key={task.id}
                    value={`task-${task.id}`}
                    onSelect={() => { setCommandPaletteOpen(false); openTaskDetail(task.id); }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800"
                  >
                    <StatusDot status={task.status} />
                    <span className="text-zinc-400 dark:text-zinc-500">{task.identifier}</span>
                    <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
                      {highlightMatch(task.title, debouncedSearch)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Project results */}
            {isSearching && searchResults && searchResults.projects.length > 0 && (
              <Command.Group heading={<span className="px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Projects</span>}>
                {searchResults.projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={`project-${project.id}`}
                    onSelect={() => {
                      setCommandPaletteOpen(false);
                      setActiveProjectId(project.id);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
                      {highlightMatch(project.name, debouncedSearch)}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{project.status.toLowerCase()}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Comment results */}
            {isSearching && searchResults && searchResults.comments.length > 0 && (
              <Command.Group heading={<span className="px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Comments</span>}>
                {searchResults.comments.map((comment) => (
                  <Command.Item
                    key={comment.id}
                    value={`comment-${comment.id}`}
                    onSelect={() => { setCommandPaletteOpen(false); openTaskDetail(comment.taskId); }}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-xs data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800"
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-700 dark:text-zinc-300">
                        {highlightMatch(comment.body, debouncedSearch)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        {comment.taskIdentifier} · {comment.taskTitle}
                      </div>
                    </div>
                    <ArrowRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
        )}
      </div>
    </div>
  );
}
