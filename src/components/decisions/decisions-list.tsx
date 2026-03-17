'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDecisionsStore } from '@/lib/stores/decisions-store';
import { DecisionStatusBadge } from './decision-status-badge';
import { Avatar } from '@/components/shared/avatar';
import { BRAND_AMBER } from '@/lib/constants';

interface DecisionsListProps {
  workspaceId: string;
}

const STATUS_TABS = [
  { value: null, label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUPERSEDED', label: 'Superseded' },
  { value: 'REVOKED', label: 'Revoked' },
] as const;

export function DecisionsList({ workspaceId }: DecisionsListProps) {
  const {
    selectedDecisionId,
    setSelectedDecisionId,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
  } = useDecisionsStore();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input (300ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const { data: categories = [] } = trpc.decisions.listCategories.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.decisions.list.useInfiniteQuery(
      {
        workspaceId,
        status: statusFilter as 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED' | undefined,
        category: categoryFilter ?? undefined,
        search: debouncedSearch || undefined,
        limit: 30,
      },
      {
        enabled: !!workspaceId,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    );

  const decisions = data?.pages.flatMap((p) => p.items) ?? [];
  const hasActiveFilters = statusFilter !== null || categoryFilter !== null || debouncedSearch !== '';

  return (
    <div className="flex h-full flex-col">
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

        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={categoryFilter ?? ''}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search decisions..."
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-7 pr-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 w-48"
            aria-label="Search decisions"
          />
        </div>
      </div>

      {/* Table header */}
      <div
        className="grid grid-cols-[1fr_80px_90px] md:grid-cols-[1fr_90px_100px_120px_100px_100px] gap-2 border-b border-zinc-200/60 dark:border-zinc-800 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
        role="row"
      >
        <span role="columnheader">Title</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Date</span>
        <span role="columnheader" className="hidden md:block">Participants</span>
        <span role="columnheader" className="hidden md:block">Category</span>
        <span role="columnheader" className="hidden md:block">Created by</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto" role="table" aria-label="Decisions list">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            Loading decisions...
          </div>
        ) : decisions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-medium">No matching decisions</p>
                <p className="mt-1 text-xs">Try adjusting your filters or search query</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No decisions yet</p>
                <p className="mt-1 text-xs">Record your first decision to get started</p>
              </>
            )}
          </div>
        ) : (
          <>
            {decisions.map((decision) => {
              const isSuperseded = decision.status === 'SUPERSEDED';
              const isSelected = selectedDecisionId === decision.id;

              return (
                <button
                  key={decision.id}
                  onClick={() => setSelectedDecisionId(isSelected ? null : decision.id)}
                  role="row"
                  aria-selected={isSelected}
                  className={`grid w-full grid-cols-[1fr_80px_90px] md:grid-cols-[1fr_90px_100px_120px_100px_100px] gap-2 border-b border-zinc-100 dark:border-zinc-800/60 px-5 py-2.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-amber-50/60 dark:bg-amber-900/10'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  } ${isSuperseded ? 'opacity-50' : ''}`}
                >
                  {/* Title */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span
                      className={`truncate font-medium text-zinc-900 dark:text-zinc-100 ${
                        isSuperseded ? 'line-through' : ''
                      }`}
                    >
                      {decision.title}
                    </span>
                    {decision.bodyPreview && (
                      <span className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                        {decision.bodyPreview}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <DecisionStatusBadge status={decision.status} />
                  </div>

                  {/* Date */}
                  <div className="flex items-center text-zinc-500 dark:text-zinc-400">
                    {new Date(decision.decisionDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>

                  {/* Participants (hidden on mobile) */}
                  <div className="hidden md:flex items-center">
                    <div className="flex -space-x-1.5">
                      {decision.participants.slice(0, 4).map((p) => (
                        <Avatar
                          key={p.userId}
                          name={p.user.name}
                          avatarUrl={p.user.avatarUrl}
                          avatarColor={p.user.avatarColor ?? undefined}
                          size="xs"
                        />
                      ))}
                      {decision.participants.length > 4 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-medium text-zinc-600 dark:text-zinc-300">
                          +{decision.participants.length - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Category (hidden on mobile) */}
                  <div className="hidden md:flex items-center text-zinc-500 dark:text-zinc-400">
                    {decision.category ? (
                      <span className="truncate rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px]">
                        {decision.category}
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Created by (hidden on mobile) */}
                  <div className="hidden md:flex items-center gap-1.5">
                    <Avatar
                      name={decision.createdBy.name}
                      avatarUrl={decision.createdBy.avatarUrl}
                      avatarColor={decision.createdBy.avatarColor ?? undefined}
                      size="xs"
                    />
                    <span className="truncate text-zinc-500 dark:text-zinc-400">
                      {decision.createdBy.name.split(' ')[0]}
                    </span>
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
                  {isFetchingNextPage ? 'Loading...' : 'Load more decisions'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
