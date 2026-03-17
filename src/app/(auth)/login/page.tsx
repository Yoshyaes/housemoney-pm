'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
import { BRAND_AMBER } from '@/lib/constants';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserSupabaseClient();

  // Handle Supabase auth errors from URL hash (e.g. expired invite links)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const errorDesc = params.get('error_description');
      const errorCode = params.get('error_code');
      if (errorDesc) {
        setHashError(errorDesc.replace(/\+/g, ' '));
      } else if (errorCode) {
        setHashError(`Authentication error: ${errorCode}`);
      }
      // Clean the hash from the URL
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const invitationError = searchParams.get('error');
  const invitationErrorMessages: Record<string, string> = {
    invalid_invitation: 'This invitation link is invalid or has expired.',
    email_mismatch: 'This invitation was sent to a different email address. Please sign in with the correct account.',
    user_not_found: 'Account not found. Please sign up first.',
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      fetch('/api/trpc/audit.logAuth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { action: 'LOGIN_FAILED', email, metadata: { error: error.message } } }) }).catch(() => {});
      setError(error.message);
      setLoading(false);
    } else {
      fetch('/api/trpc/audit.logAuth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { action: 'LOGIN_SUCCESS', email } }) }).catch(() => {});
      router.push('/');
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
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
        <h1 className="text-lg font-semibold text-zinc-900">Sign in to House Money</h1>
        <p className="mt-1 text-sm text-zinc-500">Project management for the team</p>
      </div>

      {(hashError || (invitationError && invitationErrorMessages[invitationError])) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {hashError || invitationErrorMessages[invitationError!]}
          {hashError && (
            <p className="mt-1 text-[10px] text-red-500">Please ask your admin to resend the invitation.</p>
          )}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
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
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
            placeholder="••••••••"
            required
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: BRAND_AMBER }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-500">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="font-medium" style={{ color: BRAND_AMBER }}>
          Sign up
        </a>
      </p>
    </div>
  );
}
