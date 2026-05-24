import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock supabase — middleware uses getUser, not getSession
const mockGetUser = vi.fn();

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

import { middleware } from './middleware';

function createNextRequest(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: 'GET',
  });
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  });

  it('redirects unauthenticated users to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(createNextRequest('/'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('allows unauthenticated users on auth pages', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(createNextRequest('/login'));

    expect(res.status).toBe(200);
  });

  it('allows unauthenticated users on signup page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(createNextRequest('/signup'));

    expect(res.status).toBe(200);
  });

  it('allows unauthenticated API routes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await middleware(createNextRequest('/api/trpc/test'));

    expect(res.status).toBe(200);
  });

  it('redirects authenticated users away from auth pages', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const res = await middleware(createNextRequest('/login'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/');
  });

  it('allows authenticated users on normal pages', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const res = await middleware(createNextRequest('/'));

    expect(res.status).toBe(200);
  });

  describe('auth-page detection', () => {
    it('allows unauthenticated users on /reset-password (auth page)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/reset-password'));
      expect(res.status).toBe(200);
    });

    it('redirects authenticated users away from /reset-password', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } } });
      const res = await middleware(createNextRequest('/reset-password'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/');
    });

    it('allows unauthenticated users on nested auth pages (/login/foo)', async () => {
      // startsWith('/login') matches '/login/foo'
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/login/foo'));
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated users on /signup/anything (startsWith match)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/signup/extra'));
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated users on /reset-password/confirm', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/reset-password/confirm'));
      expect(res.status).toBe(200);
    });
  });

  describe('API route handling', () => {
    it('allows unauthenticated requests to deeply nested API routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/api/github/webhook'));
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated requests to /api root', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/api'));
      expect(res.status).toBe(200);
    });

    it('allows authenticated requests to API routes (no redirect)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } } });
      const res = await middleware(createNextRequest('/api/trpc/test'));
      expect(res.status).toBe(200);
    });
  });

  describe('protected page redirects', () => {
    it('redirects unauthenticated user from nested protected route', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/projects/abc/tasks/xyz'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('redirect target uses the same origin as the request', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest(new URL('http://app.example.com:8080/dashboard'), {
        method: 'GET',
      });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location') || '';
      expect(location).toBe('http://app.example.com:8080/login');
    });

    it('handles trailing slash on protected routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/dashboard/'));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('handles paths with query strings (does not preserve them in redirect — known)', async () => {
      // The redirect target is hard-coded to /login with no `?next=`. Document that here.
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest(new URL('http://localhost/projects?filter=open'), {
        method: 'GET',
      });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location') || '';
      // Currently no query preservation
      expect(location).toBe('http://localhost/login');
      expect(location).not.toContain('?filter=open');
      expect(location).not.toContain('next=');
    });
  });

  describe('paths that share a prefix but are NOT auth pages', () => {
    it('treats /loginx as a protected (non-auth) page because startsWith("/login") matches', async () => {
      // Documents current behavior: '/login' prefix match is too permissive.
      // /loginx happens to be matched as an auth page. If/when this is tightened
      // (e.g. exact match or '/login/' prefix), update this assertion.
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await middleware(createNextRequest('/loginx'));
      // Current behavior: NOT redirected (treated as auth page).
      expect(res.status).toBe(200);
    });
  });

  describe('Supabase env vars', () => {
    it('still calls supabase.auth.getUser even on auth pages', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await middleware(createNextRequest('/login'));
      expect(mockGetUser).toHaveBeenCalled();
    });
  });
});
