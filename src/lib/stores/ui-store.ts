'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewType = 'board' | 'list' | 'timeline';
type SwimlaneMode = 'assignee' | 'priority' | 'label' | 'none';

export type QuickActionType = 'priority' | 'assignee' | 'dueDate' | 'label';

export interface ActiveFilters {
  status?: string[];
  priority?: string[];
  assigneeId?: string[];
  labelId?: string[];
  isBlocked?: boolean;
}

export interface ActiveSort {
  field: string;
  direction: 'asc' | 'desc';
}

interface QuickActionPopover {
  type: QuickActionType;
  taskId: string;
  anchorRect: { top: number; left: number; width: number; height: number };
}

interface UIState {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;

  detailPanelOpen: boolean;
  setDetailPanelOpen: (open: boolean) => void;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;

  createModalOpen: boolean;
  setCreateModalOpen: (open: boolean) => void;

  swimlaneMode: SwimlaneMode;
  setSwimlaneMode: (mode: SwimlaneMode) => void;

  collapsedSwimlanes: Set<string>;
  toggleSwimlaneCollapse: (key: string) => void;

  selectedIndex: number;
  setSelectedIndex: (index: number) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  shortcutHelpOpen: boolean;
  setShortcutHelpOpen: (open: boolean) => void;

  // Inbox
  inboxOpen: boolean;
  setInboxOpen: (open: boolean) => void;

  // Filters & Sort
  activeFilters: ActiveFilters;
  setActiveFilters: (filters: ActiveFilters) => void;
  activeSort: ActiveSort | null;
  setActiveSort: (sort: ActiveSort | null) => void;
  clearFilters: () => void;

  // Multi-select
  selectedTaskIds: Set<string>;
  toggleTaskSelection: (taskId: string) => void;
  clearSelection: () => void;

  // Inline editing
  inlineEditingTaskId: string | null;
  setInlineEditingTaskId: (id: string | null) => void;

  // Quick action popover
  quickActionPopover: QuickActionPopover | null;
  openQuickAction: (popover: QuickActionPopover) => void;
  closeQuickAction: () => void;

  // Mobile sidebar
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Settings
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeView: 'board',
      setActiveView: (view) => set({ activeView: view }),

      activeProjectId: null,
      setActiveProjectId: (id) => set({ activeProjectId: id }),

      activeTaskId: null,
      setActiveTaskId: (id) => set({ activeTaskId: id }),

      detailPanelOpen: false,
      setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
      openTaskDetail: (id) => set({ activeTaskId: id, detailPanelOpen: true }),
      closeTaskDetail: () => set({ activeTaskId: null, detailPanelOpen: false }),

      createModalOpen: false,
      setCreateModalOpen: (open) => set({ createModalOpen: open }),

      swimlaneMode: 'assignee',
      setSwimlaneMode: (mode) => set({ swimlaneMode: mode }),

      collapsedSwimlanes: new Set(),
      toggleSwimlaneCollapse: (key) =>
        set((state) => {
          const next = new Set(state.collapsedSwimlanes);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { collapsedSwimlanes: next };
        }),

      selectedIndex: -1,
      setSelectedIndex: (index) => set({ selectedIndex: index }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      shortcutHelpOpen: false,
      setShortcutHelpOpen: (open) => set({ shortcutHelpOpen: open }),

      // Inbox
      inboxOpen: false,
      setInboxOpen: (open) => set({ inboxOpen: open }),

      // Filters & Sort
      activeFilters: {},
      setActiveFilters: (filters) => set({ activeFilters: filters }),
      activeSort: null,
      setActiveSort: (sort) => set({ activeSort: sort }),
      clearFilters: () => set({ activeFilters: {}, activeSort: null }),

      // Multi-select
      selectedTaskIds: new Set(),
      toggleTaskSelection: (taskId) =>
        set((state) => {
          const next = new Set(state.selectedTaskIds);
          if (next.has(taskId)) next.delete(taskId);
          else next.add(taskId);
          return { selectedTaskIds: next };
        }),
      clearSelection: () => set({ selectedTaskIds: new Set() }),

      // Inline editing
      inlineEditingTaskId: null,
      setInlineEditingTaskId: (id) => set({ inlineEditingTaskId: id }),

      // Quick action popover
      quickActionPopover: null,
      openQuickAction: (popover) => set({ quickActionPopover: popover }),
      closeQuickAction: () => set({ quickActionPopover: null }),

      // Mobile sidebar
      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

      // Settings
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: 'hm-ui-store',
      partialize: (state) => ({
        activeView: state.activeView,
        activeProjectId: state.activeProjectId,
        swimlaneMode: state.swimlaneMode,
        collapsedSwimlanes: Array.from(state.collapsedSwimlanes),
        activeFilters: state.activeFilters,
        activeSort: state.activeSort,
      }),
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        return {
          ...current,
          ...(p || {}),
          collapsedSwimlanes: new Set(
            (p?.collapsedSwimlanes as string[]) || []
          ),
          selectedTaskIds: new Set(),
        };
      },
    }
  )
);
