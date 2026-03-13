'use client';

import { STATUS_COLORS } from '@/lib/constants';
import { Avatar } from '@/components/shared/avatar';
import { LabelChip } from '@/components/shared/label-chip';
import { useUIStore } from '@/lib/stores/ui-store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskCardProps {
  task: {
    id: string;
    identifier: string;
    title: string;
    status: string;
    priority: string;
    assignee?: { name: string; avatarUrl?: string | null; avatarColor?: string } | null;
    labels: Array<{ label: { id: string; name: string; color: string; bgColor: string } }>;
    blockedBy: Array<{ blockingTask: { status: string } }>;
  };
  isDraggable?: boolean;
}

export function TaskCard({ task, isDraggable = true }: TaskCardProps) {
  const { openTaskDetail, activeTaskId } = useUIStore();
  const statusColor = STATUS_COLORS[task.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.BACKLOG;
  const isBlocked = task.blockedBy?.some(
    (dep) => dep.blockingTask.status !== 'DONE' && dep.blockingTask.status !== 'CANCELLED'
  );
  const isSelected = activeTaskId === task.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !isDraggable,
    data: { type: 'task', task },
  });

  const cardStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: statusColor,
    borderLeftWidth: '2.5px',
    opacity: isDragging ? 0.5 : task.status === 'DONE' ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      {...attributes}
      {...listeners}
      onClick={() => openTaskDetail(task.id)}
      className={`cursor-pointer rounded-md border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-600 ${
        isSelected ? 'border-zinc-400 dark:border-zinc-500' : ''
      }`}
    >
      <div className="mb-0.5 text-[9px] text-zinc-400 dark:text-zinc-500">{task.identifier}</div>
      <div className="mb-1.5 text-[11px] leading-[1.4] text-zinc-900 dark:text-zinc-100">{task.title}</div>
      <div className="flex flex-wrap items-center gap-1">
        {task.labels?.map((tl) => (
          <LabelChip
            key={tl.label.id}
            name={tl.label.name}
            color={tl.label.color}
            bgColor={tl.label.bgColor}
          />
        ))}
        {isBlocked && (
          <span className="flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px]"
            style={{ backgroundColor: 'rgba(226,75,74,.12)', color: '#A32D2D' }}
          >
            ● blocked
          </span>
        )}
        {task.assignee && (
          <div className="ml-auto">
            <Avatar
              name={task.assignee.name}
              avatarUrl={task.assignee.avatarUrl}
              avatarColor={task.assignee.avatarColor}
              size="xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}
