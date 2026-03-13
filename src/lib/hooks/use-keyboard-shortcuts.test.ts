// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useUIStore } from '@/lib/stores/ui-store';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...opts })
  );
}

describe('useKeyboardShortcuts', () => {
  const tasks = [{ id: 'task-1' }, { id: 'task-2' }, { id: 'task-3' }];

  beforeEach(() => {
    // Reset store to defaults
    useUIStore.setState({
      commandPaletteOpen: false,
      createModalOpen: false,
      detailPanelOpen: false,
      shortcutHelpOpen: false,
      inboxOpen: false,
      selectedIndex: -1,
      quickActionPopover: null,
      inlineEditingTaskId: null,
      activeView: 'board',
      selectedTaskIds: new Set(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens command palette on Cmd+K', () => {
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('k', { metaKey: true });

    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });

  it('opens command palette on Ctrl+K', () => {
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('k', { ctrlKey: true });

    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });

  it('opens create modal on c key', () => {
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('c');

    expect(useUIStore.getState().createModalOpen).toBe(true);
  });

  it('opens shortcut help on ? key', () => {
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('?');

    expect(useUIStore.getState().shortcutHelpOpen).toBe(true);
  });

  it('navigates down with j key', () => {
    useUIStore.setState({ selectedIndex: 0 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('j');

    expect(useUIStore.getState().selectedIndex).toBe(1);
  });

  it('navigates up with k key', () => {
    useUIStore.setState({ selectedIndex: 2 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('k');

    expect(useUIStore.getState().selectedIndex).toBe(1);
  });

  it('clamps j navigation to last task', () => {
    useUIStore.setState({ selectedIndex: 2 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('j');

    expect(useUIStore.getState().selectedIndex).toBe(2); // stays at 2 (last index)
  });

  it('clamps k navigation to first task', () => {
    useUIStore.setState({ selectedIndex: 0 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('k');

    expect(useUIStore.getState().selectedIndex).toBe(0); // stays at 0
  });

  it('opens task detail on Enter', () => {
    useUIStore.setState({ selectedIndex: 1 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('Enter');

    expect(useUIStore.getState().activeTaskId).toBe('task-2');
    expect(useUIStore.getState().detailPanelOpen).toBe(true);
  });

  it('toggles task selection on x', () => {
    useUIStore.setState({ selectedIndex: 0 });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('x');

    expect(useUIStore.getState().selectedTaskIds.has('task-1')).toBe(true);

    // Toggle off
    fireKey('x');
    expect(useUIStore.getState().selectedTaskIds.has('task-1')).toBe(false);
  });

  it('closes command palette on Escape', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('Escape');
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it('closes create modal on Escape when palette is closed', () => {
    useUIStore.setState({ createModalOpen: true, commandPaletteOpen: false });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('Escape');
    expect(useUIStore.getState().createModalOpen).toBe(false);
  });

  it('closes detail panel on Escape', () => {
    useUIStore.setState({ detailPanelOpen: true, activeTaskId: 'task-1' });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('Escape');
    expect(useUIStore.getState().detailPanelOpen).toBe(false);
    expect(useUIStore.getState().activeTaskId).toBeNull();
  });

  it('switches to board view with g+b combo', async () => {
    useUIStore.setState({ activeView: 'list' });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('g');
    fireKey('b');

    expect(useUIStore.getState().activeView).toBe('board');
  });

  it('switches to list view with g+l combo', async () => {
    useUIStore.setState({ activeView: 'board' });
    renderHook(() => useKeyboardShortcuts(tasks));

    fireKey('g');
    fireKey('l');

    expect(useUIStore.getState().activeView).toBe('list');
  });

  it('does not fire shortcuts when typing in input', () => {
    renderHook(() => useKeyboardShortcuts(tasks));

    // Simulate keydown from an input element
    const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true });
    Object.defineProperty(event, 'target', {
      value: document.createElement('input'),
    });
    window.dispatchEvent(event);

    expect(useUIStore.getState().createModalOpen).toBe(false);
  });
});
