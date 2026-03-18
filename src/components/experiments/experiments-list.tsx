'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useExperimentsStore } from '@/lib/stores/experiments-store';
import { ExperimentStatusBadge } from './experiment-status-badge';
import { ExperimentScoreBadge } from './experiment-score-badge';
import { Avatar } from '@/components/shared/avatar';
import {
  BRAND_AMBER,
  EXPERIMENT_PERSONA_LABELS,
  EXPERIMENT_TYPE_LABELS,
  EXPERIMENT_CHANNEL_LABELS,
} from '@/lib/constants';
import type { ExperimentStatus, ExperimentPersona, ExperimentChannel, ExperimentType } from '@/generated/prisma/client';

interface ExperimentsListProps {
  workspaceId: string;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string }>;
}

const STATUS_TABS = [
  { value: null, label: 'All' },
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ICEBOX', label: 'Icebox' },
] as const;

export function ExperimentsList({ workspaceId, members }: ExperimentsListProps) {
  const {
    selectedExperimentId,
    setSelectedExperimentId,
    statusFilter,
    setStatusFilter,
    personaFilter,
    setPersonaFilter,
    channelFilter,
    setChannelFilter,
    typeFilter,
    setTypeFilter,
    ownerFilter,
    setOwnerFilter,
  } = useExperimentsStore();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const { data: stats } = trpc.experiments.getStats.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.experiments.list.useInfiniteQuery(
      {
        workspaceId,
        status: (statusFilter || undefined) as ExperimentStatus | undefined,
        persona: (personaFilter || undefined) as ExperimentPersona | undefined,
        channel: (channelFilter || undefined) as ExperimentChannel | undefined,
        experimentType: (typeFilter || undefined) as ExperimentType | undefined,
        ownerId: ownerFilter ?? undefined,
        search: debouncedSearch || undefined,
        limit: 30,
      },
      {
        enabled: !!workspaceId,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    );

  const experiments = data?.pages.flatMap((p) => p.items) ?? [];
  const hasActiveFilters = statusFilter !== null || personaFilter !== null || channelFilter !== null || typeFilter !== null || ownerFilter !== null || debouncedSearch !== '';

  return (
    <div className="flex h-full flex-col">
      {/* Stats summary */}
      {stats && stats.totalCount > 0 && (
        <div className="flex items-center gap-3 border-b border-zinc-200/60 dark:border-zinc-800 px-5 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{stats.totalCount} experiment{stats.totalCount !== 1 ? 's' : ''}</span>
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <span key={status} className="flex items-center gap-1">
              <span className="font-medium">{count as number}</span> {status === 'IN_PROGRESS' ? 'In Progress' : status.charAt(0) + status.slice(1).toLowerCase()}
            </span>
          ))}
          {stats.avgScore > 0 && (
            <span>Avg Score: <span className="font-medium">{stats.avgScore.toFixed(1)}</span>/8</span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/60 dark:border-zinc-800 px-5 py-2.5">
        {/* Status tabs */}
        <div className="flex items-center gap-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 p-0.5" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setStatusFilter(tab.value)}
              role="tab"
              aria-selected={statusFilter === tab.value}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Persona filter */}
        <select
          value={personaFilter ?? ''}
          onChange={(e) => setPersonaFilter(e.target.value || null)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none"
          aria-label="Filter by persona"
        >
          <option value="">All personas</option>
          {Object.entries(EXPERIMENT_PERSONA_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={typeFilter ?? ''}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {Object.entries(EXPERIMENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Channel filter */}
        <select
          value={channelFilter ?? ''}
          onChange={(e) => setChannelFilter(e.target.value || null)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none hidden md:block"
          aria-label="Filter by channel"
        >
          <option value="">All channels</option>
          {Object.entries(EXPERIMENT_CHANNEL_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Owner filter */}
        <select
          value={ownerFilter ?? ''}
          onChange={(e) => setOwnerFilter(e.target.value || null)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none hidden md:block"
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search experiments..."
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-7 pr-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 w-48"
            aria-label="Search experiments"
          />
        </div>
      </div>

      {/* Table header */}
      <div
        className="grid grid-cols-[60px_1fr_80px_80px] md:grid-cols-[60px_1fr_90px_90px_90px_60px_80px_90px] gap-2 border-b border-zinc-200/60 dark:border-zinc-800 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
        role="row"
      >
        <span role="columnheader">EXP #</span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Persona</span>
        <span role="columnheader" className="hidden md:block">Type</span>
        <span role="columnheader" className="hidden md:block">Score</span>
        <span role="columnheader" className="hidden md:block">Owner</span>
        <span role="columnheader" className="hidden md:block">Dates</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto" role="table" aria-label="Experiments list">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            Loading experiments...
          </div>
        ) : experiments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-medium">No matching experiments</p>
                <p className="mt-1 text-xs">Try adjusting your filters or search query</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No experiments yet</p>
                <p className="mt-1 text-xs">Create your first experiment to start testing hypotheses</p>
              </>
            )}
          </div>
        ) : (
          <>
            {experiments.map((experiment) => {
              const isIcebox = experiment.status === 'ICEBOX';
              const isSelected = selectedExperimentId === experiment.id;

              return (
                <button
                  key={experiment.id}
                  onClick={() => setSelectedExperimentId(isSelected ? null : experiment.id)}
                  role="row"
                  aria-selected={isSelected}
                  className={`grid w-full grid-cols-[60px_1fr_80px_80px] md:grid-cols-[60px_1fr_90px_90px_90px_60px_80px_90px] gap-2 border-b border-zinc-100 dark:border-zinc-800/60 px-5 py-2.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-amber-50/60 dark:bg-amber-900/10'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  } ${isIcebox ? 'opacity-50' : ''}`}
                >
                  {/* EXP # */}
                  <div className="flex items-center">
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {experiment.identifier}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {experiment.title}
                    </span>
                    {experiment.hypothesisPreview && (
                      <span className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                        {experiment.hypothesisPreview}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <ExperimentStatusBadge status={experiment.status} />
                  </div>

                  {/* Persona */}
                  <div className="flex items-center text-zinc-500 dark:text-zinc-400">
                    {experiment.persona ? (
                      <span className="truncate">{EXPERIMENT_PERSONA_LABELS[experiment.persona] ?? experiment.persona}</span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Type (hidden on mobile) */}
                  <div className="hidden md:flex items-center text-zinc-500 dark:text-zinc-400">
                    {experiment.experimentType ? (
                      <span className="truncate text-[11px]">{EXPERIMENT_TYPE_LABELS[experiment.experimentType] ?? experiment.experimentType}</span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Score (hidden on mobile) */}
                  <div className="hidden md:flex items-center">
                    <ExperimentScoreBadge score={experiment.score} />
                  </div>

                  {/* Owner (hidden on mobile) */}
                  <div className="hidden md:flex items-center gap-1.5">
                    {experiment.owner ? (
                      <>
                        <Avatar
                          name={experiment.owner.name}
                          avatarUrl={experiment.owner.avatarUrl}
                          avatarColor={experiment.owner.avatarColor ?? undefined}
                          size="xs"
                        />
                        <span className="truncate text-zinc-500 dark:text-zinc-400">
                          {experiment.owner.name.split(' ')[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Dates (hidden on mobile) */}
                  <div className="hidden md:flex items-center text-[11px] text-zinc-500 dark:text-zinc-400">
                    {experiment.startDate ? (
                      <span>
                        {new Date(experiment.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {experiment.endDate && (
                          <> — {new Date(experiment.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Load More */}
            {hasNextPage && (
              <div className="flex justify-center py-3">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="rounded-md px-4 py-1.5 text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: BRAND_AMBER, color: '#fff' }}
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more experiments'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
