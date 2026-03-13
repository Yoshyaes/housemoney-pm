'use client';

import { useUIStore } from '@/lib/stores/ui-store';
import { X } from 'lucide-react';

const shortcuts = [
  { key: 'C', action: 'Create new task' },
  { key: 'Cmd+K', action: 'Open command palette' },
  { key: 'G → B', action: 'Go to Board view' },
  { key: 'G → L', action: 'Go to List view' },
  { key: 'G → I', action: 'Go to Inbox' },
  { key: 'J / K', action: 'Navigate up/down' },
  { key: 'Enter', action: 'Open selected task' },
  { key: 'Esc', action: 'Close panel / deselect' },
  { key: 'X', action: 'Select task' },
  { key: 'E', action: 'Edit title inline' },
  { key: 'P', action: 'Set priority' },
  { key: 'A', action: 'Assign to member' },
  { key: 'D', action: 'Set due date' },
  { key: 'L', action: 'Add label' },
  { key: '?', action: 'Show this help' },
];

export function ShortcutHelp() {
  const { shortcutHelpOpen, setShortcutHelpOpen } = useUIStore();

  if (!shortcutHelpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => setShortcutHelpOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Keyboard shortcuts</h2>
          <button
            onClick={() => setShortcutHelpOpen(false)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{s.action}</span>
              <kbd className="ml-2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
