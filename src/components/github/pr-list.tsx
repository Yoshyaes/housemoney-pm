'use client';

import { GitPullRequest, GitMerge, ExternalLink } from 'lucide-react';

interface PR {
  id: string;
  number: number;
  repo: string;
  title: string;
  url: string;
  status: string;
  authorLogin: string;
  authorAvatar: string | null;
}

interface PRListProps {
  prs: PR[];
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  OPEN: { color: '#639922', bg: 'rgba(99,153,34,.12)', label: 'Open' },
  MERGED: { color: '#7F77DD', bg: 'rgba(127,119,221,.12)', label: 'Merged' },
  CLOSED: { color: '#E24B4A', bg: 'rgba(226,75,74,.12)', label: 'Closed' },
};

export function PRList({ prs }: PRListProps) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Pull Requests
          {prs.length > 0 && (
            <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">({prs.length})</span>
          )}
        </span>
      </div>

      {prs.length === 0 && (
        <div className="py-1 text-[11px] text-zinc-400 dark:text-zinc-500">No linked pull requests</div>
      )}

      {prs.map((pr) => {
        const config = STATUS_CONFIG[pr.status] || STATUS_CONFIG.OPEN;
        const Icon = pr.status === 'MERGED' ? GitMerge : GitPullRequest;

        return (
          <a
            key={pr.id}
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1.5 flex items-center gap-2 rounded-md border border-zinc-200/60 px-2 py-1.5 text-[11px] transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
          >
            <Icon
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: config.color }}
            />
            <span
              className="rounded-full px-1.5 py-px text-[9px]"
              style={{ backgroundColor: config.bg, color: config.color }}
            >
              {config.label}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">#{pr.number}</span>
            <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{pr.title}</span>
            {pr.authorAvatar && (
              <img
                src={pr.authorAvatar}
                alt={pr.authorLogin}
                className="h-4 w-4 flex-shrink-0 rounded-full"
              />
            )}
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
          </a>
        );
      })}
    </div>
  );
}
