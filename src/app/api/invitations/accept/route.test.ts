import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted shared mocks
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findInvitation: vi.fn(),
  findUser: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    invitation: { findUnique: mocks.findInvitation },
    user: { findUnique: mocks.findUser },
  },
}));

vi.mock('@/server/invitations/accept-invitation', () => ({
  acceptInvitation: mocks.acceptInvitation,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { GET } from './route';

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET' });
}

describe('GET /api/invitations/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    mocks.acceptInvitation.mockResolvedValue(undefined);
  });

  it('redirects to /login when token is missing', async () => {
    const res = await GET(createRequest('http://localhost/api/invitations/accept'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
    expect(mocks.findInvitation).not.toHaveBeenCalled();
  });

  it('redirects with error=invalid_invitation when token does not match an invitation', async () => {
    mocks.findInvitation.mockResolvedValue(null);

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=invalid_invitation');
    expect(mocks.findInvitation).toHaveBeenCalledWith({
      where: { token: 'abc' },
      include: { workspace: { select: { name: true, slug: true } } },
    });
  });

  it('redirects with error=invalid_invitation when invitation is already accepted', async () => {
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: new Date('2026-01-01'),
      expiresAt: new Date('2099-01-01'),
      email: 'foo@x.com',
      workspaceId: 'ws-1',
    });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=invalid_invitation');
  });

  it('redirects with error=invalid_invitation when invitation is expired', async () => {
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: null,
      expiresAt: new Date('2020-01-01'),
      email: 'foo@x.com',
      workspaceId: 'ws-1',
    });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=abc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=invalid_invitation');
  });

  it('redirects unauthenticated users to /signup with the invitation token', async () => {
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: null,
      expiresAt: new Date('2099-01-01'),
      email: 'new@x.com',
      workspaceId: 'ws-1',
    });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=secret-tok'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/signup?invitation=secret-tok');
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it('redirects to /login?error=user_not_found if the auth user has no db user row', async () => {
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: null,
      expiresAt: new Date('2099-01-01'),
      email: 'foo@x.com',
      workspaceId: 'ws-1',
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1', email: 'foo@x.com' } } });
    mocks.findUser.mockResolvedValue(null);

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=tok'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=user_not_found');
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it('redirects to /login?error=email_mismatch when the logged-in email differs from the invitation', async () => {
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: null,
      expiresAt: new Date('2099-01-01'),
      email: 'invited@x.com',
      workspaceId: 'ws-1',
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } } });
    mocks.findUser.mockResolvedValue({ id: 'auth-user-1', email: 'somebody-else@x.com' });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=tok'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=email_mismatch');
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts the invitation and redirects to / on success', async () => {
    const invitation = {
      id: 'inv-99',
      acceptedAt: null,
      expiresAt: new Date('2099-01-01'),
      email: 'fred@x.com',
      workspaceId: 'ws-1',
      role: 'MEMBER',
      projectIds: [],
    };
    mocks.findInvitation.mockResolvedValue(invitation);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-7' } } });
    mocks.findUser.mockResolvedValue({ id: 'auth-user-7', email: 'fred@x.com' });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=tok'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.acceptInvitation).toHaveBeenCalledWith(
      expect.anything(),
      invitation,
      'auth-user-7'
    );
  });

  it('compares emails case-sensitively (a known invariant of the current implementation)', async () => {
    // This documents current behaviour: case differences are treated as a mismatch.
    mocks.findInvitation.mockResolvedValue({
      id: 'inv-1',
      acceptedAt: null,
      expiresAt: new Date('2099-01-01'),
      email: 'Fred@example.com',
      workspaceId: 'ws-1',
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } } });
    mocks.findUser.mockResolvedValue({ id: 'auth-user-1', email: 'fred@example.com' });

    const res = await GET(createRequest('http://localhost/api/invitations/accept?token=tok'));
    expect(res.headers.get('location')).toContain('error=email_mismatch');
  });
});
