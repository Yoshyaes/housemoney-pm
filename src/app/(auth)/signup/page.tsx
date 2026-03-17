'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
import { BRAND_AMBER } from '@/lib/constants';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get('invitation');
  const supabase = createBrowserSupabaseClient();

  const handleGoogleSignup = async () => {
    const redirectTo = invitationToken
      ? `${window.location.origin}/api/auth/callback?invitation=${invitationToken}`
      : `${window.location.origin}/api/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      fetch('/api/trpc/audit.logAuth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { action: 'SIGNUP_FAILED', email, metadata: { error: error.message } } }) }).catch(() => {});
      setError(error.message);
      setLoading(false);
    } else {
      fetch('/api/trpc/audit.logAuth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { action: 'SIGNUP', email, metadata: { name, hasInvitation: !!invitationToken } } }) }).catch(() => {});
      // Invitation acceptance happens automatically via auto-accept in createContext
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <div
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          HM
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">
          {invitationToken ? 'Join your team' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {invitationToken
            ? "You've been invited to collaborate on House Money PM"
            : 'Get started with House Money PM'}
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white text-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            placeholder="Fred Thompson"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white text-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            placeholder="you@housemoney.com"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white text-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            placeholder="••••••••"
            minLength={6}
            required
          />
          <p className="mt-1 text-[11px] text-zinc-400">Must be at least 6 characters</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-500">
        Already have an account?{' '}
        <a href="/login" className="font-medium" style={{ color: BRAND_AMBER }}>
          Sign in
        </a>
      </p>
    </div>
  );
}
