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
});
