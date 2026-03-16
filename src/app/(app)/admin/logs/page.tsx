'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Shield, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { BRAND_AMBER } from '@/lib/constants';

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  LOGIN_SUCCESS: { label: 'Login', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  LOGIN_FAILED: { label: 'Login Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  SIGNUP: { label: 'Signup', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  SIGNUP_FAILED: { label: 'Signup Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  OAUTH_LOGIN: { label: 'OAuth Login', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  ACCOUNT_CREATED: { label: 'Account Created', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  PASSWORD_RESET_REQUESTED: { label: 'Password Reset', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  INVITATION_SENT: { label: 'Invite Sent', color: '#BA7517', bg: 'rgba(186,117,23,0.12)' },
  INVITATION_ACCEPTED: { label: 'Invite Accepted', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  MEMBER_REMOVED: { label: 'Member Removed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(([k]) => k !== 'error');
  if (entries.length === 0 && !metadata.error) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
}

export default function AuditLogsPage() {
  const { data: workspace } = trpc.workspace.getCurrent.useQuery();
  const workspaceId = workspace?.id || '';

  const [actionFilter, setActionFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState('');

  const { data, isLoading, refetch, fetchNextPage, hasNextPage } = trpc.audit.list.useInfiniteQuery(
    { workspaceId, limit: 50, action: actionFilter || undefined, email: emailFilter || undefined },
    {
      enabled: !!workspaceId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-zinc-200/60 dark:border-zinc-800 px-6 py-4">
        <Shield className="h-5 w-5" style={{ color: BRAND_AMBER }} />
        <div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audit Log</h1>
          <p className="text-[11px] text-zinc-400">Track authentication events and security activity</p>
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto rounded p-1.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 px-6 py-2.5">
        {/* Action filter */}
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="appearance-none rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-2.5 pr-7 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 outline-none cursor-pointer"
          >
            <option value="">All events</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
        </div>

        {/* Email search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
          <input
            type="text"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder="Search by email..."
            className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-7 pr-2.5 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading audit logs...</div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-8 w-8 text-zinc-200 dark:text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-400">No audit log entries found</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
              <tr>
                <th className="px-6 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Time</th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Event</th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">User / Email</th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Details</th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {allItems.map((entry) => {
                const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, color: '#71717a', bg: 'rgba(113,113,122,0.12)' };
                const meta = entry.metadata as Record<string, unknown> | null;
                const details = formatMetadata(meta);
                const errorMsg = meta?.error as string | undefined;

                return (
                  <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-2.5 text-[11px] text-zinc-400 whitespace-nowrap">
                      {formatTime(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: actionInfo.bg, color: actionInfo.color }}
                      >
                        {actionInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div>
                        {entry.user ? (
                          <span className="text-xs text-zinc-700 dark:text-zinc-300">{entry.user.name}</span>
                        ) : null}
                        {entry.email && (
                          <p className="text-[10px] text-zinc-400 truncate max-w-[200px]">{entry.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {errorMsg ? (
                        <span className="text-[10px] text-red-500">{errorMsg}</span>
                      ) : details ? (
                        <span className="text-[10px] text-zinc-400">{details}</span>
                      ) : (
                        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                      {entry.ipAddress || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Load more */}
        {hasNextPage && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => fetchNextPage()}
              className="rounded-md px-4 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
