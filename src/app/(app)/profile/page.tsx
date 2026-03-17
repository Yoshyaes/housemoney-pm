'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useCurrentMembership } from '@/lib/hooks/use-current-membership';
import { Sidebar } from '@/components/layout/sidebar';
import { Avatar } from '@/components/shared/avatar';
import { BRAND_AMBER } from '@/lib/constants';
import { User, Camera, Lock, Bell, Monitor, Trash2, Check, Sun, Moon, AlertTriangle } from 'lucide-react';

const AVATAR_COLORS = ['#BA7517', '#185FA5', '#0F6E56', '#99355A', '#534AB7', '#D97706', '#059669', '#DC2626'];

const NOTIFICATION_TYPES = [
  { key: 'assigned', label: 'Task assigned to me', description: 'When someone assigns a task to you' },
  { key: 'mentioned', label: 'Mentioned in comment', description: 'When someone @mentions you in a comment' },
  { key: 'comment', label: 'Comments on my tasks', description: 'When someone comments on a task you created or are assigned to' },
  { key: 'statusChange', label: 'Status changes', description: 'When a task you follow changes status' },
  { key: 'dependencyResolved', label: 'Dependencies resolved', description: 'When a blocking task is completed' },
  { key: 'aiInsight', label: 'AI insights', description: 'When the AI agent has suggestions for you' },
];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const utils = trpc.useUtils();

  const { data: workspace } = trpc.workspace.getCurrent.useQuery();
  const workspaceId = workspace?.id || '';
  const { data: members = [] } = trpc.workspace.getMembers.useQuery({ workspaceId }, { enabled: !!workspaceId });
  const { data: projects = [] } = trpc.projects.list.useQuery({ workspaceId }, { enabled: !!workspaceId });
  const { data: savedViews = [] } = trpc.views.list.useQuery({ workspaceId }, { enabled: !!workspaceId });
  const { data: profile, refetch: refetchProfile } = trpc.workspace.getProfile.useQuery();

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const member = members.find((m) => m.id === user.id);
        if (member) setCurrentUser({ id: member.id, name: member.name, avatarUrl: member.avatarUrl, avatarColor: member.avatarColor ?? undefined });
      }
    };
    if (members.length > 0) fetchUser();
  }, [members, supabase]);

  const { isGuest, isAdmin } = useCurrentMembership(members, currentUser?.id);

  // Form state
  const [editName, setEditName] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);
  const [passwordFields, setPasswordFields] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme state
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  useEffect(() => {
    const stored = localStorage.getItem('hm-theme') as 'light' | 'dark' | 'system' | null;
    if (stored) setThemeState(stored);
  }, []);

  const setTheme = (t: 'light' | 'dark' | 'system') => {
    setThemeState(t);
    localStorage.setItem('hm-theme', t);
    const root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    else if (t === 'light') root.classList.remove('dark');
    else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  };

  // Notification prefs
  const notifPrefs = (profile?.notificationPrefs as Record<string, boolean> | null) || {};
  const getNotifPref = (key: string) => notifPrefs[key] !== false; // default true

  useEffect(() => {
    if (profile) setEditName(profile.name);
  }, [profile]);

  const [updateError, setUpdateError] = useState('');
  const [colorSuccess, setColorSuccess] = useState(false);

  const updateUser = trpc.workspace.updateUser.useMutation({
    onSuccess: () => {
      refetchProfile();
      utils.workspace.getMembers.invalidate({ workspaceId });
      setUpdateError('');
    },
    onError: (e) => {
      setUpdateError(e.message);
      setTimeout(() => setUpdateError(''), 5000);
    },
  });
  const deleteAccount = trpc.workspace.deleteAccount.useMutation({
    onSuccess: async () => {
      await supabase.auth.signOut();
      window.location.href = '/login';
    },
  });

  const handleNameSave = () => {
    if (!profile || !editName.trim() || editName === profile.name) return;
    updateUser.mutate({ userId: profile.id, name: editName.trim() }, {
      onSuccess: () => {
        setNameSuccess(true);
        setTimeout(() => setNameSuccess(false), 2000);
      },
    });
  };

  const handleAvatarColorChange = (color: string) => {
    if (!profile) return;
    updateUser.mutate({ userId: profile.id, avatarColor: color }, {
      onSuccess: () => {
        setColorSuccess(true);
        setTimeout(() => setColorSuccess(false), 1500);
      },
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        updateUser.mutate({ userId: profile.id, avatarUrl: data.url });
      }
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    if (!profile) return;
    updateUser.mutate({ userId: profile.id, avatarUrl: null });
  };

  const handlePasswordChange = async () => {
    setPasswordError('');
    if (passwordFields.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (passwordFields.newPassword !== passwordFields.confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: passwordFields.newPassword });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess(true);
      setPasswordFields({ newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 3000);
    }
  };

  const handleNotifToggle = (key: string) => {
    if (!profile) return;
    const current = { ...notifPrefs };
    current[key] = !getNotifPref(key);
    updateUser.mutate({ userId: profile.id, notificationPrefs: current });
  };

  const handleDeleteAccount = () => {
    if (deleteText !== 'DELETE') return;
    deleteAccount.mutate();
  };

  if (!profile) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  const sidebarProjects = projects.map((p) => ({
    id: p.id, name: p.name, color: p.color, status: p.status,
    progress: (p as { progress?: number }).progress ?? 0, isPrivate: p.isPrivate,
  }));

  return (
    <>
      <Sidebar
        projects={sidebarProjects}
        savedViews={savedViews}
        currentUser={currentUser}
        workspaceSlug={workspace?.slug || 'house-money'}
        workspaceId={workspaceId}
        onProjectsChange={() => {}}
        isGuest={isGuest}
        isAdmin={isAdmin}
      />

      <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-xl px-6 py-8 space-y-8">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Profile</h1>
            <p className="text-xs text-zinc-400 mt-0.5">Manage your account and preferences</p>
          </div>

          {updateError && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {updateError}
            </div>
          )}

          {/* ── Profile Info ── */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <User className="h-3.5 w-3.5" /> Profile
            </h2>

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar name={profile.name} avatarUrl={profile.avatarUrl} avatarColor={profile.avatarColor} size="xl" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="h-4 w-4 text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                >
                  {uploadingAvatar ? 'Uploading...' : 'Upload photo'}
                </button>
                {profile.avatarUrl && (
                  <button onClick={handleRemoveAvatar} className="block text-[10px] text-zinc-400 hover:text-red-500">
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Avatar color */}
            <div>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Avatar color {colorSuccess && <span className="text-green-500 ml-1">Updated!</span>}
              </label>
              <div className="flex gap-1.5 mt-1">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleAvatarColorChange(c)}
                    className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: profile.avatarColor === c ? c : 'transparent' }}
                  />
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Display name</label>
              <div className="flex gap-2 mt-1">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                />
                <button
                  onClick={handleNameSave}
                  disabled={!editName.trim() || editName === profile.name}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  {nameSuccess ? <Check className="h-3.5 w-3.5" /> : 'Save'}
                </button>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Email</label>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{profile.email}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">Email cannot be changed</p>
            </div>

            {/* Member since */}
            <div>
              <label className="text-[11px] text-zinc-500 dark:text-zinc-400">Member since</label>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </section>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* ── Password ── */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Lock className="h-3.5 w-3.5" /> Password
            </h2>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="New password"
                value={passwordFields.newPassword}
                onChange={(e) => setPasswordFields({ ...passwordFields, newPassword: e.target.value })}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={passwordFields.confirmPassword}
                onChange={(e) => setPasswordFields({ ...passwordFields, confirmPassword: e.target.value })}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
              />
              {passwordError && <p className="text-[11px] text-red-500">{passwordError}</p>}
              {passwordSuccess && <p className="text-[11px] text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Password updated</p>}
              <button
                onClick={handlePasswordChange}
                disabled={!passwordFields.newPassword || !passwordFields.confirmPassword}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                style={{ backgroundColor: BRAND_AMBER }}
              >
                Update password
              </button>
            </div>
          </section>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* ── Theme ── */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Monitor className="h-3.5 w-3.5" /> Appearance
            </h2>
            <div className="flex gap-2">
              {([
                { value: 'light' as const, label: 'Light', icon: Sun },
                { value: 'dark' as const, label: 'Dark', icon: Moon },
                { value: 'system' as const, label: 'System', icon: Monitor },
              ]).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                    theme === t.value
                      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* ── Notifications ── */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Bell className="h-3.5 w-3.5" /> Notifications
            </h2>
            <div className="space-y-1">
              {NOTIFICATION_TYPES.map((nt) => (
                <div key={nt.key} className="flex items-center justify-between rounded-md border border-zinc-100 dark:border-zinc-800 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{nt.label}</p>
                    <p className="text-[10px] text-zinc-400">{nt.description}</p>
                  </div>
                  <button
                    onClick={() => handleNotifToggle(nt.key)}
                    className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                      getNotifPref(nt.key) ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      getNotifPref(nt.key) ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* ── Danger Zone ── */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
            </h2>
            <div className="rounded-md border border-red-200 dark:border-red-900/50 p-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Delete account</p>
                <p className="text-[10px] text-zinc-400">Permanently delete your account and all associated data. This cannot be undone.</p>
              </div>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="rounded-md border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete my account
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-red-600">Type <strong>DELETE</strong> to confirm:</p>
                  <div className="flex gap-2">
                    <input
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      className="flex-1 rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                      placeholder="DELETE"
                    />
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteText !== 'DELETE' || deleteAccount.isPending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {deleteAccount.isPending ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(false); setDeleteText(''); }}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
