'use client';

import { Avatar } from '@/components/shared/avatar';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

interface Activity {
  id: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string | Date;
  user: {
    name: string;
    avatarUrl?: string | null;
    avatarColor: string;
  };
}

interface ActivityListProps {
  activities: Activity[];
}

function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatActionDescription(activity: Activity): string {
  const { action, field, oldValue, newValue } = activity;

  if (action === 'created') return 'created this task';

  if (action === 'status_changed' || field === 'status') {
    const from = STATUS_LABELS[oldValue || ''] || oldValue;
    const to = STATUS_LABELS[newValue || ''] || newValue;
    return `changed status from ${from} to ${to}`;
  }

  if (action === 'priority_changed' || field === 'priority') {
    const from = PRIORITY_LABELS[oldValue || ''] || oldValue;
    const to = PRIORITY_LABELS[newValue || ''] || newValue;
    return `changed priority from ${from} to ${to}`;
  }

  if (field === 'assigneeId') {
    if (!newValue) return 'unassigned the task';
    return 'reassigned the task';
  }

  if (field === 'title') return 'updated the title';
  if (field === 'description') return 'updated the description';
  if (field === 'dueDate') return newValue ? 'set due date' : 'removed due date';

  if (action === 'dependency_added') return 'added a dependency';
  if (action === 'dependency_removed') return 'removed a dependency';

  if (field) return `updated ${field}`;
  return action.replace(/_/g, ' ');
}

export function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className="py-4 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-2">
          <Avatar
            name={activity.user.name}
            avatarUrl={activity.user.avatarUrl}
            avatarColor={activity.user.avatarColor}
            size="xs"
            className="mt-0.5 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              {activity.user.name}
            </span>{' '}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {formatActionDescription(activity)}
            </span>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {formatRelativeTime(activity.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
