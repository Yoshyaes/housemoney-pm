'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import type { ActiveFilters } from '@/lib/stores/ui-store';
import { BRAND_AMBER, STATUS_ORDER, STATUS_LABELS, STATUS_BG_COLORS, STATUS_TEXT_COLORS, PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/constants';
import { Avatar } from '@/components/shared/avatar';
import { Filter, ArrowDownWideNarrow, X } from 'lucide-react';

type SwimlaneMode = 'assignee' | 'priority' | 'label' | 'none';

interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string;
}

interface Label {
  id: string;
  name: string;
  color: string;
  bgColor: string;
}

interface FilterBarProps {
  members?: Member[];
  labels?: Label[];
}

export function FilterBar({ members = [], labels = [] }: FilterBarProps) {
  const { swimlaneMode, setSwimlaneMode, activeFilters, setActiveFilters, activeSort, setActiveSort, clearFilters } = useUIStore();
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const swimlaneOptions: { id: SwimlaneMode; label: string }[] = [
    { id: 'assignee', label: 'Assignee' },
    { id: 'priority', label: 'Priority' },
    { id: 'label', label: 'Label' },
  ];

  const toggleFilterValue = (key: keyof ActiveFilters, value: string) => {
    const current = (activeFilters[key] as string[] | undefined) || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setActiveFilters({ ...activeFilters, [key]: next.length > 0 ? next : undefined });
  };

  const activeFilterCount = [
    activeFilters.status?.length || 0,
    activeFilters.priority?.length || 0,
    activeFilters.assigneeId?.length || 0,
    activeFilters.labelId?.length || 0,
    activeFilters.isBlocked ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const sortFields: Array<{ field: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title'; label: string }> = [
    { field: 'createdAt', label: 'Created' },
    { field: 'updatedAt', label: 'Updated' },
    { field: 'title', label: 'Title' },
    { field: 'priority', label: 'Priority' },
    { field: 'dueDate', label: 'Due date' },
  ];

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-200/60 dark:border-zinc-800 px-3 py-[7px] md:flex-wrap md:px-4">
      <span className="flex-shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">Swimlane</span>

      {swimlaneOptions.map((opt) => (
        <button
          key={opt.id}
          onClick={() => setSwimlaneMode(opt.id === swimlaneMode ? 'none' : opt.id)}
          className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
            swimlaneMode === opt.id
              ? 'border-amber-300/60 text-amber-700'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
          style={
            swimlaneMode === opt.id
              ? { backgroundColor: `${BRAND_AMBER}10`, color: BRAND_AMBER, borderColor: `${BRAND_AMBER}59` }
              : undefined
          }
        >
          {opt.label}
        </button>
      ))}

      <div className="ml-auto flex flex-shrink-0 gap-1.5">
        {/* Filter button + dropdown */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false); }}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
              activeFilterCount > 0
                ? 'border-amber-300/60 text-amber-700'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            style={activeFilterCount > 0 ? { backgroundColor: `${BRAND_AMBER}10`, color: BRAND_AMBER, borderColor: `${BRAND_AMBER}59` } : undefined}
          >
            <Filter className="h-2.5 w-2.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-600 text-[8px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 top-full z-30 mt-1 w-[260px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2 shadow-lg">
              {/* Status */}
              <div className="px-3 pb-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Status</div>
              <div className="mb-2 flex flex-wrap gap-1 px-3">
                {STATUS_ORDER.map((s) => {
                  const active = activeFilters.status?.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleFilterValue('status', s)}
                      className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                        active ? 'ring-1 ring-amber-400' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: STATUS_BG_COLORS[s], color: STATUS_TEXT_COLORS[s] }}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>

              {/* Priority */}
              <div className="px-3 pb-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Priority</div>
              <div className="mb-2 flex flex-wrap gap-1 px-3">
                {PRIORITY_ORDER.map((p) => {
                  const active = activeFilters.priority?.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => toggleFilterValue('priority', p)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                        active ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 dark:border-zinc-700 opacity-60 hover:opacity-100'
                      }`}
                      style={{ color: PRIORITY_COLORS[p as keyof typeof PRIORITY_COLORS] }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  );
                })}
              </div>

              {/* Assignee */}
              {members.length > 0 && (
                <>
                  <div className="px-3 pb-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Assignee</div>
                  <div className="mb-2 space-y-0.5 px-2">
                    {members.map((m) => {
                      const active = activeFilters.assigneeId?.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleFilterValue('assigneeId', m.id)}
                          className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-[11px] transition-colors ${
                            active ? 'bg-amber-50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <Avatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor} size="xs" />
                          <span className="text-zinc-700 dark:text-zinc-300">{m.name}</span>
                          {active && <span className="ml-auto text-amber-600">&#10003;</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Labels */}
              {labels.length > 0 && (
                <>
                  <div className="px-3 pb-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Label</div>
                  <div className="mb-2 flex flex-wrap gap-1 px-3">
                    {labels.map((label) => {
                      const active = activeFilters.labelId?.includes(label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => toggleFilterValue('labelId', label.id)}
                          className={`rounded-full px-1.5 py-px text-[9px] font-medium transition-colors ${
                            active ? 'ring-1 ring-amber-400' : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: label.bgColor, color: label.color }}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Blocked toggle */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 pt-2">
                <label className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={activeFilters.isBlocked || false}
                    onChange={(e) => setActiveFilters({ ...activeFilters, isBlocked: e.target.checked || undefined })}
                    className="rounded"
                  />
                  Show only blocked tasks
                </label>
              </div>

              {/* Clear */}
              {activeFilterCount > 0 && (
                <div className="mt-2 border-t border-zinc-100 dark:border-zinc-800 px-3 pt-2">
                  <button
                    onClick={() => { clearFilters(); setShowFilterDropdown(false); }}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X className="h-2.5 w-2.5" />
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sort button + dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false); }}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
              activeSort
                ? 'border-amber-300/60 text-amber-700'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            style={activeSort ? { backgroundColor: `${BRAND_AMBER}10`, color: BRAND_AMBER, borderColor: `${BRAND_AMBER}59` } : undefined}
          >
            <ArrowDownWideNarrow className="h-2.5 w-2.5" />
            Sort
            {activeSort && (
              <span className="text-[9px] opacity-70">
                ({sortFields.find((f) => f.field === activeSort.field)?.label} {activeSort.direction === 'asc' ? '↑' : '↓'})
              </span>
            )}
          </button>

          {showSortDropdown && (
            <div className="absolute right-0 top-full z-30 mt-1 w-[180px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 shadow-lg">
              {sortFields.map((sf) => {
                const isActive = activeSort?.field === sf.field;
                return (
                  <button
                    key={sf.field}
                    onClick={() => {
                      if (isActive) {
                        setActiveSort({ field: sf.field, direction: activeSort.direction === 'asc' ? 'desc' : 'asc' });
                      } else {
                        setActiveSort({ field: sf.field, direction: 'asc' });
                      }
                      setShowSortDropdown(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      isActive ? 'font-medium text-amber-700' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {sf.label}
                    {isActive && (
                      <span className="text-[10px]">{activeSort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                );
              })}
              {activeSort && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1">
                  <button
                    onClick={() => { setActiveSort(null); setShowSortDropdown(false); }}
                    className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X className="h-2.5 w-2.5" />
                    Clear sort
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
