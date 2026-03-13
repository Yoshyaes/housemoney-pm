'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Avatar } from '@/components/shared/avatar';
import { formatRelativeTime } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';
import { useNotificationStore } from '@/lib/stores/notification-store';
import { Check, Clock, Archive, CheckCheck } from 'lucide-react';
import { addHours } from 'date-fns';

interface NotificationInboxProps {
  onClose: () => void;
}

export function NotificationInbox({ onClose }: NotificationInboxProps) {
  const [filter, setFilter] = useState<'unread' | 'all' | 'archived'>('unread');
  const { openTaskDetail } = useUIStore();
  const { setUnreadCount } = useNotificationStore();

  const { data, refetch } = trpc.notifications.list.useQuery({ filter });
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      refetch();
      countQuery.refetch();
    },
  });
  const snooze = trpc.notifications.snooze.useMutation({ onSuccess: () => refetch() });
  const archive = trpc.notifications.archive.useMutation({ onSuccess: () => refetch() });
  const countQuery = trpc.notifications.unreadCount.useQuery();

  useEffect(() => {
    if (countQuery.data !== undefined) {
      setUnreadCount(countQuery.data);
    }
  }, [countQuery.data, setUnreadCount]);

  const notifications = data?.notifications || [];

  const tabs = [
    { id: 'unread' as const, label: 'Unread' },
    { id: 'all' as const, label: 'All' },
    { id: 'archived' as const, label: 'Archived' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Inbox</h2>
        <button
          onClick={() => markRead.mutate({ all: true })}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-200/60 px-4 py-2 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              filter === tab.id ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
            <Check className="mb-2 h-8 w-8" />
            <span className="text-xs">All caught up</span>
          </div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            className="group flex cursor-pointer items-start gap-3 border-b border-zinc-100 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
            onClick={() => {
              if (n.task) {
                openTaskDetail(n.task.id);
                onClose();
              }
              if (!n.read) markRead.mutate({ id: n.id });
            }}
          >
            {!n.read && (
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
            )}
            {n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0" />}

            <Avatar name={n.actor.name} avatarColor={n.actor.avatarColor} size="sm" />

            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">{n.actor.name}</span>{' '}
                {n.message}
              </div>
              {n.task && (
                <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                  {n.task.identifier} · {n.task.title}
                </div>
              )}
              <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                {formatRelativeTime(n.createdAt)}
              </div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              {!n.read && (
                <button
                  onClick={(e) => { e.stopPropagation(); markRead.mutate({ id: n.id }); }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                  title="Mark read"
                >
                  <Check className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); snooze.mutate({ id: n.id, until: addHours(new Date(), 3) }); }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                title="Snooze 3h"
              >
                <Clock className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); archive.mutate({ id: n.id }); }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
                title="Archive"
              >
                <Archive className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
