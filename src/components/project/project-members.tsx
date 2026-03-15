'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { X, Plus, Trash2, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/shared/avatar';
import { GuestBadge } from '@/components/shared/guest-badge';
import { BRAND_AMBER } from '@/lib/constants';

interface ProjectMembersProps {
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

export function ProjectMembers({ projectId, workspaceId, onClose }: ProjectMembersProps) {
  const utils = trpc.useUtils();
  const [addingMember, setAddingMember] = useState(false);

  const { data: projectMembers = [] } = trpc.projects.getMembers.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const { data: workspaceMembers = [] } = trpc.workspace.getMembers.useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  const addMember = trpc.projects.addMember.useMutation({
    onSuccess: () => {
      utils.projects.getMembers.invalidate({ projectId });
    },
  });

  const removeMember = trpc.projects.removeMember.useMutation({
    onSuccess: () => {
      utils.projects.getMembers.invalidate({ projectId });
    },
  });

  // Members not yet added to the project
  const availableMembers = workspaceMembers.filter(
    (wm) => !projectMembers.some((pm) => pm.id === wm.id)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[70vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Project members</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {projectMembers.length === 0 ? (
            <p className="text-xs text-zinc-400 py-2">No explicit members. All workspace members with access can see this project.</p>
          ) : (
            projectMembers.map((member) => {
              const workspaceMember = workspaceMembers.find((wm) => wm.id === member.id);
              return (
                <div key={member.id} className="flex items-center gap-3 rounded-md border border-zinc-100 dark:border-zinc-800 px-3 py-2">
                  <Avatar
                    name={member.name}
                    avatarUrl={member.avatarUrl}
                    avatarColor={member.avatarColor}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{member.name}</p>
                      {workspaceMember?.role === 'GUEST' && <GuestBadge />}
                    </div>
                    <p className="text-[10px] text-zinc-400 truncate">{member.email}</p>
                  </div>
                  <button
                    onClick={() => removeMember.mutate({ projectId, userId: member.id })}
                    className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                    title="Remove from project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add member section */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
          {!addingMember ? (
            <button
              onClick={() => setAddingMember(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add member to project
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Add workspace member</p>
              {availableMembers.length === 0 ? (
                <p className="text-xs text-zinc-400">All workspace members are already added.</p>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {availableMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => addMember.mutate({ projectId, userId: member.id })}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Avatar name={member.name} avatarUrl={member.avatarUrl} avatarColor={member.avatarColor} size="xs" />
                      <span className="truncate">{member.name}</span>
                      {member.role === 'GUEST' && <GuestBadge />}
                      <Plus className="ml-auto h-3 w-3 text-zinc-400" />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setAddingMember(false)}
                className="text-[10px] text-zinc-400 hover:text-zinc-600"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
