'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { BRAND_AMBER } from '@/lib/constants';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  // Supabase sets the session automatically from the URL hash when the page loads
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Also check if there's already a session (user clicked link and session is set)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 2000);
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
        <h1 className="text-lg font-semibold text-zinc-900">Set new password</h1>
        <p className="mt-1 text-sm text-zinc-500">Enter your new password below</p>
      </div>

      {success ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-center">
          <p className="text-sm font-medium text-green-700">Password updated!</p>
          <p className="text-xs text-green-600 mt-1">Redirecting you to the app...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white text-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            disabled={loading || !sessionReady}
            className="w-full rounded-md py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: BRAND_AMBER }}
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>

          {!sessionReady && (
            <p className="text-center text-[11px] text-zinc-400">Verifying your reset link...</p>
          )}
        </form>
      )}
    </div>
  );
}
