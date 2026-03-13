'use client';

import { useEffect, useRef } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import type { QuickActionType } from '@/lib/stores/ui-store';

interface MinimalTask {
  id: string;
}

export function useKeyboardShortcuts(tasks: MinimalTask[] = []) {
  const {
    setCommandPaletteOpen,
    setCreateModalOpen,
    setActiveView,
    setShortcutHelpOpen,
    setInboxOpen,
    commandPaletteOpen,
    createModalOpen,
    detailPanelOpen,
    closeTaskDetail,
    openTaskDetail,
    selectedIndex,
    setSelectedIndex,
    toggleTaskSelection,
    setInlineEditingTaskId,
    openQuickAction,
    quickActionPopover,
    inlineEditingTaskId,
  } = useUIStore();

  const prefixRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Cmd+K always works
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Escape always works
      if (e.key === 'Escape') {
        if (quickActionPopover) {
          useUIStore.getState().closeQuickAction();
        } else if (inlineEditingTaskId) {
          setInlineEditingTaskId(null);
        } else if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (createModalOpen) {
          setCreateModalOpen(false);
        } else if (detailPanelOpen) {
          closeTaskDetail();
        }
        return;
      }

      // Don't capture shortcuts when typing in inputs
      if (isInput) return;

      // Don't capture when a quick action popover is open
      if (quickActionPopover) return;

      // Two-key combos (G+B, G+L, G+I)
      if (prefixRef.current === 'g') {
        prefixRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        switch (e.key) {
          case 'b':
            e.preventDefault();
            setActiveView('board');
            return;
          case 'l':
            e.preventDefault();
            setActiveView('list');
            return;
          case 'i':
            e.preventDefault();
            setInboxOpen(true);
            return;
        }
      }

      if (e.key === 'g') {
        prefixRef.current = 'g';
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          prefixRef.current = null;
        }, 500);
        return;
      }

      // Helper to get anchor rect for quick action popover
      const getAnchorRect = () => {
        const row = document.querySelector(`[data-task-index="${selectedIndex}"]`);
        if (row) {
          const rect = row.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        }
        return { top: 200, left: 400, width: 300, height: 32 };
      };

      const openQuickActionForSelected = (type: QuickActionType) => {
        if (selectedIndex < 0 || selectedIndex >= tasks.length) return;
        const taskId = tasks[selectedIndex].id;
        openQuickAction({ type, taskId, anchorRect: getAnchorRect() });
      };

      // Single-key shortcuts
      switch (e.key) {
        case 'c':
          e.preventDefault();
          setCreateModalOpen(true);
          break;
        case '?':
          e.preventDefault();
          setShortcutHelpOpen(true);
          break;
        case 'j':
          e.preventDefault();
          if (tasks.length > 0) {
            const next = Math.min(selectedIndex + 1, tasks.length - 1);
            setSelectedIndex(next);
          }
          break;
        case 'k':
          e.preventDefault();
          if (tasks.length > 0) {
            const prev = Math.max(selectedIndex - 1, 0);
            setSelectedIndex(prev);
          }
          break;
        case 'Enter':
          if (selectedIndex >= 0 && selectedIndex < tasks.length) {
            e.preventDefault();
            openTaskDetail(tasks[selectedIndex].id);
          }
          break;
        case 'x':
          if (selectedIndex >= 0 && selectedIndex < tasks.length) {
            e.preventDefault();
            toggleTaskSelection(tasks[selectedIndex].id);
          }
          break;
        case 'e':
          if (selectedIndex >= 0 && selectedIndex < tasks.length) {
            e.preventDefault();
            setInlineEditingTaskId(tasks[selectedIndex].id);
          }
          break;
        case 'p':
          e.preventDefault();
          openQuickActionForSelected('priority');
          break;
        case 'a':
          e.preventDefault();
          openQuickActionForSelected('assignee');
          break;
        case 'd':
          e.preventDefault();
          openQuickActionForSelected('dueDate');
          break;
        case 'l':
          e.preventDefault();
          openQuickActionForSelected('label');
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    commandPaletteOpen,
    createModalOpen,
    detailPanelOpen,
    quickActionPopover,
    inlineEditingTaskId,
    selectedIndex,
    tasks,
    setCommandPaletteOpen,
    setCreateModalOpen,
    setActiveView,
    setShortcutHelpOpen,
    setInboxOpen,
    closeTaskDetail,
    openTaskDetail,
    setSelectedIndex,
    toggleTaskSelection,
    setInlineEditingTaskId,
    openQuickAction,
  ]);
}
