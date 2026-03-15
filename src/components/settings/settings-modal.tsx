'use client';

import { useState } from 'react';
import { useUIStore } from '@/lib/stores/ui-store';
import { trpc } from '@/lib/trpc';
import { X, Plus, Trash2, Edit2, Check, AlertCircle, KeyRound, ChevronDown, Lock, Globe } from 'lucide-react';
import { BRAND_AMBER } from '@/lib/constants';
import { GuestBadge } from '@/components/shared/guest-badge';

const PROJECT_COLORS = [
  '#1D9E75', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B',
  '#10B981', '#6366F1', '#EC4899', '#14B8A6', '#F97316',
];

const LABEL_PRESETS = [
  { name: 'Bug', color: '#ef4444', bgColor: 'rgba(239,68,68,0.12)' },
  { name: 'Feature', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.12)' },
  { name: 'Design', color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.12)' },
  { name: 'Docs', color: '#10b981', bgColor: 'rgba(16,185,129,0.12)' },
  { name: 'Infra', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' },
];

type Tab = 'projects' | 'labels' | 'members';

interface SettingsModalProps {
  workspaceId?: string;
}

export function SettingsModal({ workspaceId: workspaceIdProp }: SettingsModalProps) {
  const { settingsOpen, setSettingsOpen } = useUIStore();
  const { data: workspace } = trpc.workspace.getCurrent.useQuery(undefined, {
    enabled: settingsOpen && !workspaceIdProp,
  });
  const workspaceId = workspaceIdProp || workspace?.id || '';
  const [tab, setTab] = useState<Tab>('projects');
  const utils = trpc.useUtils();

  // ── Projects ──────────────────────────────────────────────
  const { data: projects = [] } = trpc.projects.list.useQuery(
    { workspaceId },
    { enabled: settingsOpen && !!workspaceId }
  );
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [newProjectPrivate, setNewProjectPrivate] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [projectError, setProjectError] = useState('');

  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate({ workspaceId });
      setNewProjectName('');
      setProjectError('');
    },
    onError: (e) => setProjectError(e.message),
  });
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate({ workspaceId });
      setEditingProject(null);
    },
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate({ workspaceId }),
  });

  // ── Labels ────────────────────────────────────────────────
  const { data: labels = [] } = trpc.workspace.getLabels.useQuery(
    { workspaceId },
    { enabled: settingsOpen && !!workspaceId }
  );
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [newLabelBg, setNewLabelBg] = useState('rgba(59,130,246,0.12)');
  const [labelError, setLabelError] = useState('');

  const createLabel = trpc.workspace.createLabel.useMutation({
    onSuccess: () => {
      utils.workspace.getLabels.invalidate({ workspaceId });
      setNewLabelName('');
      setLabelError('');
    },
    onError: (e) => setLabelError(e.message),
  });
  const deleteLabel = trpc.workspace.deleteLabel.useMutation({
    onSuccess: () => utils.workspace.getLabels.invalidate({ workspaceId }),
  });

  // ── Members ───────────────────────────────────────────────
  const { data: members = [] } = trpc.workspace.getMembers.useQuery(
    { workspaceId },
    { enabled: settingsOpen && !!workspaceId }
  );
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'GUEST'>('MEMBER');
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [editingMember, setEditingMember] = useState<{ id: string; name: string } | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const inviteMember = trpc.workspace.inviteMember.useMutation({
    onSuccess: (data) => {
      utils.workspace.getMembers.invalidate({ workspaceId });
      setInviteEmail('');
      setInviteRole('MEMBER');
      setInviteProjectIds([]);
      setInviteError('');
      setInviteSuccess(`${data.user.name} added to workspace.`);
      setTimeout(() => setInviteSuccess(''), 3000);
    },
    onError: (e) => {
      setInviteError(e.message);
      setInviteSuccess('');
    },
  });
  const removeMember = trpc.workspace.removeMember.useMutation({
    onSuccess: () => utils.workspace.getMembers.invalidate({ workspaceId }),
    onError: (e) => setInviteError(e.message),
  });
  const updateMemberRole = trpc.workspace.updateMemberRole.useMutation({
    onSuccess: () => utils.workspace.getMembers.invalidate({ workspaceId }),
  });
  const updateUser = trpc.workspace.updateUser.useMutation({
    onSuccess: () => {
      utils.workspace.getMembers.invalidate({ workspaceId });
      setEditingMember(null);
    },
  });
  const sendPasswordReset = trpc.workspace.sendPasswordReset.useMutation({
    onSuccess: (_, vars) => {
      setResetSuccess(`Password reset email sent to ${vars.email}`);
      setTimeout(() => setResetSuccess(null), 4000);
    },
  });

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-5">
          {(['projects', 'labels', 'members'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`mr-4 py-2.5 text-xs capitalize transition-colors border-b-2 ${
                tab === t
                  ? 'border-amber-500 font-medium text-zinc-900 dark:text-zinc-100'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Projects tab ── */}
          {tab === 'projects' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 rounded-md border border-zinc-100 dark:border-zinc-800 px-3 py-2"
                  >
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                    {editingProject?.id === project.id ? (
                      <input
                        autoFocus
                        value={editingProject.name}
                        onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateProject.mutate({ id: project.id, name: editingProject.name });
                          if (e.key === 'Escape') setEditingProject(null);
                        }}
                        className="flex-1 text-xs bg-transparent outline-none border-b border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100"
                      />
                    ) : (
                      <span className="flex-1 text-xs text-zinc-800 dark:text-zinc-200">{project.name}</span>
                    )}
                    <span className="text-[10px] text-zinc-400">{project._count?.tasks ?? 0} tasks</span>
                    {/* Visibility toggle */}
                    <button
                      onClick={() => updateProject.mutate({ id: project.id, isPrivate: !project.isPrivate })}
                      title={project.isPrivate ? 'Private — click to make public' : 'Public — click to make private'}
                      className={`rounded p-0.5 transition-colors ${
                        project.isPrivate
                          ? 'text-amber-500 hover:text-zinc-400'
                          : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-500'
                      }`}
                    >
                      {project.isPrivate
                        ? <Lock className="h-3.5 w-3.5" />
                        : <Globe className="h-3.5 w-3.5" />
                      }
                    </button>
                    {editingProject?.id === project.id ? (
                      <button
                        onClick={() => updateProject.mutate({ id: project.id, name: editingProject.name })}
                        className="text-zinc-400 hover:text-green-500"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingProject({ id: project.id, name: project.name })}
                        className="text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete project "${project.name}"? Tasks will lose their project association.`)) {
                          deleteProject.mutate({ id: project.id });
                        }
                      }}
                      className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add project */}
              <div className="rounded-md border border-dashed border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">New project</p>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newProjectName.trim()) {
                      createProject.mutate({ workspaceId, name: newProjectName.trim(), color: newProjectColor });
                    }
                  }}
                />
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewProjectColor(c)}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: newProjectColor === c ? c : 'transparent' }}
                    />
                  ))}
                </div>
                {/* Privacy toggle for new project */}
                <button
                  type="button"
                  onClick={() => setNewProjectPrivate(!newProjectPrivate)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    newProjectPrivate
                      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                  }`}
                >
                  {newProjectPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {newProjectPrivate ? 'Private (only admins & you)' : 'Public (all members)'}
                </button>
                {projectError && (
                  <p className="flex items-center gap-1 text-[10px] text-red-500">
                    <AlertCircle className="h-3 w-3" /> {projectError}
                  </p>
                )}
                <button
                  onClick={() => {
                    if (newProjectName.trim()) {
                      createProject.mutate({ workspaceId, name: newProjectName.trim(), color: newProjectColor, isPrivate: newProjectPrivate });
                    }
                  }}
                  disabled={!newProjectName.trim() || createProject.isPending}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add project
                </button>
              </div>
            </div>
          )}

          {/* ── Labels tab ── */}
          {tab === 'labels' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {labels.map((label) => (
                  <div
                    key={label.id}
                    className="flex items-center gap-3 rounded-md border border-zinc-100 dark:border-zinc-800 px-3 py-2"
                  >
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: label.bgColor, color: label.color }}
                    >
                      {label.name}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => deleteLabel.mutate({ id: label.id })}
                        className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {labels.length === 0 && (
                  <p className="text-xs text-zinc-400 py-2">No labels yet.</p>
                )}
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Quick add</p>
                <div className="flex flex-wrap gap-1.5">
                  {LABEL_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => createLabel.mutate({ workspaceId, name: p.name, color: p.color, bgColor: p.bgColor })}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: p.bgColor, color: p.color }}
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom label */}
              <div className="rounded-md border border-dashed border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Custom label</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="Label name"
                    className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-zinc-400">Text</label>
                    <input
                      type="color"
                      value={newLabelColor}
                      onChange={(e) => setNewLabelColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700 bg-transparent p-0"
                    />
                    <label className="text-[10px] text-zinc-400">BG</label>
                    <input
                      type="color"
                      value={newLabelBg.startsWith('rgba') ? '#3b82f6' : newLabelBg}
                      onChange={(e) => setNewLabelBg(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700 bg-transparent p-0"
                    />
                  </div>
                </div>
                {labelError && (
                  <p className="flex items-center gap-1 text-[10px] text-red-500">
                    <AlertCircle className="h-3 w-3" /> {labelError}
                  </p>
                )}
                <button
                  onClick={() => {
                    if (newLabelName.trim()) {
                      createLabel.mutate({
                        workspaceId,
                        name: newLabelName.trim(),
                        color: newLabelColor,
                        bgColor: newLabelBg,
                      });
                    }
                  }}
                  disabled={!newLabelName.trim() || createLabel.isPending}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add label
                </button>
              </div>
            </div>
          )}

          {/* ── Members tab ── */}
          {tab === 'members' && (() => {
            const teamMembers = members.filter((m) => m.role === 'ADMIN' || m.role === 'MEMBER');
            const guestMembers = members.filter((m) => m.role === 'GUEST');

            const renderMemberRow = (member: typeof members[0]) => (
              <div
                key={member.id}
                className="rounded-md border border-zinc-100 dark:border-zinc-800 px-3 py-2.5 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: member.avatarColor || BRAND_AMBER }}
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingMember?.id === member.id ? (
                      <input
                        autoFocus
                        value={editingMember.name}
                        onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateUser.mutate({ userId: member.id, name: editingMember.name });
                          if (e.key === 'Escape') setEditingMember(null);
                        }}
                        className="w-full text-xs bg-transparent border-b border-zinc-300 dark:border-zinc-600 outline-none text-zinc-900 dark:text-zinc-100"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{member.name}</p>
                        {member.role === 'GUEST' && <GuestBadge />}
                      </div>
                    )}
                    <p className="text-[10px] text-zinc-400 truncate">{member.email}</p>
                  </div>

                  {/* Role selector */}
                  <div className="relative">
                    <select
                      value={member.role}
                      onChange={(e) => updateMemberRole.mutate({ workspaceId, userId: member.id, role: e.target.value as 'ADMIN' | 'MEMBER' | 'GUEST' })}
                      className="appearance-none rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-2 pr-5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400 outline-none cursor-pointer"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                      <option value="GUEST">Guest</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-zinc-400" />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {editingMember?.id === member.id ? (
                      <button onClick={() => updateUser.mutate({ userId: member.id, name: editingMember.name })} className="text-zinc-400 hover:text-green-500">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button onClick={() => setEditingMember({ id: member.id, name: member.name })} className="text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-300" title="Edit name">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => sendPasswordReset.mutate({ email: member.email })}
                      className="text-zinc-300 hover:text-blue-500 dark:text-zinc-600 dark:hover:text-blue-400"
                      title="Send password reset"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${member.name} from workspace?`)) {
                          removeMember.mutate({ workspaceId, userId: member.id });
                        }
                      }}
                      className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );

            return (
              <div className="space-y-4">
                {resetSuccess && (
                  <p className="flex items-center gap-1 rounded bg-green-50 dark:bg-green-900/20 px-3 py-2 text-[10px] text-green-600 dark:text-green-400">
                    <Check className="h-3 w-3" /> {resetSuccess}
                  </p>
                )}

                {/* Team members */}
                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Team</p>
                  {teamMembers.map(renderMemberRow)}
                </div>

                {/* Guest members */}
                {guestMembers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Guests</p>
                    {guestMembers.map(renderMemberRow)}
                  </div>
                )}

                {/* Invite */}
                <div className="rounded-md border border-dashed border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Invite</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); }}
                      placeholder="email@example.com"
                      className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 px-2 py-1.5 text-xs outline-none"
                    />
                    <div className="relative">
                      <select
                        value={inviteRole}
                        onChange={(e) => { setInviteRole(e.target.value as 'MEMBER' | 'GUEST'); if (e.target.value === 'MEMBER') setInviteProjectIds([]); }}
                        className="appearance-none rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-2 pr-5 py-1.5 text-[10px] text-zinc-600 dark:text-zinc-400 outline-none cursor-pointer"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="GUEST">Guest</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-zinc-400" />
                    </div>
                  </div>

                  {/* Project selector for guest invites */}
                  {inviteRole === 'GUEST' && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-400">Select projects for the guest:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => {
                              setInviteProjectIds((prev) =>
                                prev.includes(project.id)
                                  ? prev.filter((id) => id !== project.id)
                                  : [...prev, project.id]
                              );
                            }}
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                              inviteProjectIds.includes(project.id)
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                            {project.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (inviteEmail.trim()) {
                        inviteMember.mutate({
                          workspaceId,
                          email: inviteEmail.trim(),
                          role: inviteRole,
                          projectIds: inviteRole === 'GUEST' ? inviteProjectIds : undefined,
                        });
                      }
                    }}
                    disabled={!inviteEmail.trim() || inviteMember.isPending || (inviteRole === 'GUEST' && inviteProjectIds.length === 0)}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: BRAND_AMBER }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {inviteRole === 'GUEST' ? 'Invite guest' : 'Add member'}
                  </button>
                  {inviteError && (
                    <p className="flex items-center gap-1 text-[10px] text-red-500">
                      <AlertCircle className="h-3 w-3" /> {inviteError}
                    </p>
                  )}
                  {inviteSuccess && (
                    <p className="flex items-center gap-1 text-[10px] text-green-500">
                      <Check className="h-3 w-3" /> {inviteSuccess}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
