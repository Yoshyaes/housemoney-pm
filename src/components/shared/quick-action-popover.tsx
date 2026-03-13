'use client';

import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { PriorityIndicator } from './priority-indicator';
import { Avatar } from './avatar';
import { LabelChip } from './label-chip';
import { PRIORITY_ORDER } from '@/lib/constants';

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

interface QuickActionPopoverProps {
  members: Member[];
  labels: Label[];
  onUpdate: (taskId: string, field: string, value: unknown) => void;
}

export function QuickActionPopover({ members, labels, onUpdate }: QuickActionPopoverProps) {
  const { quickActionPopover, closeQuickAction } = useUIStore();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const popover = quickActionPopover;

  // Reset focused index when popover changes
  useEffect(() => {
    setFocusedIndex(0);
    if (popover?.type === 'dueDate') {
      setTimeout(() => dateInputRef.current?.focus(), 50);
    }
  }, [popover]);

  // Close on click outside
  useEffect(() => {
    if (!popover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closeQuickAction();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popover, closeQuickAction]);

  if (!popover) return null;

  const { type, taskId, anchorRect } = popover;

  // Position popover below the anchor row
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top + anchorRect.height + 4,
    left: Math.min(anchorRect.left + 40, window.innerWidth - 220),
    zIndex: 50,
  };

  const handleSelect = (field: string, value: unknown) => {
    onUpdate(taskId, field, value);
    closeQuickAction();
  };

  // Keyboard navigation within popover
  const handleKeyDown = (e: React.KeyboardEvent, items: unknown[]) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickAction();
    }
  };

  if (type === 'priority') {
    const items = [...PRIORITY_ORDER];
    return (
      <div ref={popoverRef} style={style} className="w-[180px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900" onKeyDown={(e) => handleKeyDown(e, items)} tabIndex={-1}>
        <div className="px-2 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Set priority</div>
        {items.map((p, i) => (
          <button
            key={p}
            onClick={() => handleSelect('priority', p)}
            onMouseEnter={() => setFocusedIndex(i)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSelect('priority', p); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] ${focusedIndex === i ? 'bg-zinc-50 dark:bg-zinc-800' : ''} hover:bg-zinc-50 dark:hover:bg-zinc-800`}
            autoFocus={i === 0}
          >
            <PriorityIndicator priority={p} />
          </button>
        ))}
      </div>
    );
  }

  if (type === 'assignee') {
    const items = [{ id: '__unassigned', name: 'Unassigned' }, ...members];
    return (
      <div ref={popoverRef} style={style} className="w-[200px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900" onKeyDown={(e) => handleKeyDown(e, items)} tabIndex={-1}>
        <div className="px-2 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Assign to</div>
        {items.map((m, i) => (
          <button
            key={m.id}
            onClick={() => handleSelect('assigneeId', m.id === '__unassigned' ? null : m.id)}
            onMouseEnter={() => setFocusedIndex(i)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSelect('assigneeId', m.id === '__unassigned' ? null : m.id); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] ${focusedIndex === i ? 'bg-zinc-50 dark:bg-zinc-800' : ''} hover:bg-zinc-50 dark:hover:bg-zinc-800`}
            autoFocus={i === 0}
          >
            {m.id === '__unassigned' ? (
              <span className="text-zinc-400 dark:text-zinc-500">Unassigned</span>
            ) : (
              <>
                <Avatar name={m.name} avatarUrl={(m as Member).avatarUrl} avatarColor={(m as Member).avatarColor} size="xs" />
                <span className="text-zinc-700 dark:text-zinc-300">{m.name}</span>
              </>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (type === 'dueDate') {
    return (
      <div ref={popoverRef} style={style} className="w-[200px] rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Set due date</div>
        <input
          ref={dateInputRef}
          type="date"
          className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          onChange={(e) => {
            if (e.target.value) {
              handleSelect('dueDate', new Date(e.target.value).toISOString());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeQuickAction();
            }
          }}
        />
        <button
          onClick={() => handleSelect('dueDate', null)}
          className="mt-1 w-full rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          Clear due date
        </button>
      </div>
    );
  }

  if (type === 'label') {
    return (
      <div ref={popoverRef} style={style} className="w-[200px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900" tabIndex={-1}>
        <div className="px-2 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Add label</div>
        {labels.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">No labels available</div>
        )}
        {labels.map((label, i) => (
          <button
            key={label.id}
            onClick={() => handleSelect('labels', [label.id])}
            onMouseEnter={() => setFocusedIndex(i)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] ${focusedIndex === i ? 'bg-zinc-50 dark:bg-zinc-800' : ''} hover:bg-zinc-50 dark:hover:bg-zinc-800`}
            autoFocus={i === 0}
          >
            <LabelChip name={label.name} color={label.color} bgColor={label.bgColor} />
          </button>
        ))}
      </div>
    );
  }

  return null;
}
