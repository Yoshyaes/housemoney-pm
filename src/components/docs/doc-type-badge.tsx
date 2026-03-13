import { DocType } from '@/generated/prisma/client';

const DOC_TYPE_CONFIG: Record<
  DocType,
  { label: string; className: string }
> = {
  GENERAL: { label: 'General', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  MEETING_NOTES: { label: 'Meeting Notes', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PLANNING: { label: 'Planning', className: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  RETROSPECTIVE: { label: 'Retro', className: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  DECISION_LOG: { label: 'Decision Log', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  EXPERIMENT: { label: 'Experiment', className: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  RUNBOOK: { label: 'Runbook', className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

export function DocTypeBadge({ docType }: { docType: DocType | string }) {
  const config = DOC_TYPE_CONFIG[docType as DocType] ?? {
    label: docType,
    className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export { DOC_TYPE_CONFIG };
