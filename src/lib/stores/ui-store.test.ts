import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/lib/stores/ui-store';

const initialState = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(initialState, true);
});

describe('useUIStore defaults', () => {
  it('has default activeView of board', () => {
    expect(useUIStore.getState().activeView).toBe('board');
  });

  it('has default activeProjectId of null', () => {
    expect(useUIStore.getState().activeProjectId).toBeNull();
  });

  it('has default activeTaskId of null', () => {
    expect(useUIStore.getState().activeTaskId).toBeNull();
  });

  it('has default detailPanelOpen of false', () => {
    expect(useUIStore.getState().detailPanelOpen).toBe(false);
  });

  it('has default createModalOpen of false', () => {
    expect(useUIStore.getState().createModalOpen).toBe(false);
  });

  it('has default commandPaletteOpen of false', () => {
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('has default empty selectedTaskIds', () => {
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0);
  });

  it('has default empty collapsedSwimlanes', () => {
    expect(useUIStore.getState().collapsedSwimlanes.size).toBe(0);
  });

  it('has default empty activeFilters', () => {
    expect(useUIStore.getState().activeFilters).toEqual({});
  });

  it('has default null activeSort', () => {
    expect(useUIStore.getState().activeSort).toBeNull();
  });
});

describe('setActiveView', () => {
  it('changes the active view', () => {
    useUIStore.getState().setActiveView('list');
    expect(useUIStore.getState().activeView).toBe('list');

    useUIStore.getState().setActiveView('timeline');
    expect(useUIStore.getState().activeView).toBe('timeline');
  });
});

describe('openTaskDetail / closeTaskDetail', () => {
  it('openTaskDetail sets activeTaskId and detailPanelOpen', () => {
    useUIStore.getState().openTaskDetail('task-123');
    const state = useUIStore.getState();
    expect(state.activeTaskId).toBe('task-123');
    expect(state.detailPanelOpen).toBe(true);
  });

  it('closeTaskDetail resets activeTaskId and detailPanelOpen', () => {
    useUIStore.getState().openTaskDetail('task-123');
    useUIStore.getState().closeTaskDetail();
    const state = useUIStore.getState();
    expect(state.activeTaskId).toBeNull();
    expect(state.detailPanelOpen).toBe(false);
  });
});

describe('toggleSwimlaneCollapse', () => {
  it('adds a key then removes it on second toggle', () => {
    useUIStore.getState().toggleSwimlaneCollapse('lane-1');
    expect(useUIStore.getState().collapsedSwimlanes.has('lane-1')).toBe(true);

    useUIStore.getState().toggleSwimlaneCollapse('lane-1');
    expect(useUIStore.getState().collapsedSwimlanes.has('lane-1')).toBe(false);
  });
});

describe('toggleTaskSelection', () => {
  it('adds a task then removes it on second toggle', () => {
    useUIStore.getState().toggleTaskSelection('t-1');
    expect(useUIStore.getState().selectedTaskIds.has('t-1')).toBe(true);

    useUIStore.getState().toggleTaskSelection('t-1');
    expect(useUIStore.getState().selectedTaskIds.has('t-1')).toBe(false);
  });
});

describe('clearSelection', () => {
  it('empties the selectedTaskIds set', () => {
    useUIStore.getState().toggleTaskSelection('t-1');
    useUIStore.getState().toggleTaskSelection('t-2');
    expect(useUIStore.getState().selectedTaskIds.size).toBe(2);

    useUIStore.getState().clearSelection();
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0);
  });
});

describe('clearFilters', () => {
  it('resets filters and sort', () => {
    useUIStore.getState().setActiveFilters({ status: ['TODO'] });
    useUIStore.getState().setActiveSort({ field: 'priority', direction: 'asc' });

    useUIStore.getState().clearFilters();
    expect(useUIStore.getState().activeFilters).toEqual({});
    expect(useUIStore.getState().activeSort).toBeNull();
  });
});

describe('modal setters', () => {
  it('setCreateModalOpen toggles state', () => {
    useUIStore.getState().setCreateModalOpen(true);
    expect(useUIStore.getState().createModalOpen).toBe(true);

    useUIStore.getState().setCreateModalOpen(false);
    expect(useUIStore.getState().createModalOpen).toBe(false);
  });

  it('setCommandPaletteOpen toggles state', () => {
    useUIStore.getState().setCommandPaletteOpen(true);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);

    useUIStore.getState().setCommandPaletteOpen(false);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('setShortcutHelpOpen toggles state', () => {
    useUIStore.getState().setShortcutHelpOpen(true);
    expect(useUIStore.getState().shortcutHelpOpen).toBe(true);
  });

  it('setInboxOpen toggles state', () => {
    useUIStore.getState().setInboxOpen(true);
    expect(useUIStore.getState().inboxOpen).toBe(true);
  });

  it('setMobileSidebarOpen toggles state', () => {
    useUIStore.getState().setMobileSidebarOpen(true);
    expect(useUIStore.getState().mobileSidebarOpen).toBe(true);
  });
});
