import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  cookieStore: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
  user: { findUnique: vi.fn(), upsert: vi.fn() },
  invitation: { findUnique: vi.fn() },
  workspaceMember: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
  workspace: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  acceptInvitation: vi.fn(),
  acceptPendingInvitations: vi.fn(),
  auditLogFn: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => mocks.cookieStore,
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  })),
}));

vi.mock('@/server/db', () => ({
  db: {
    user: mocks.user,
    invitation: mocks.invitation,
    workspaceMember: mocks.workspaceMember,
    workspace: mocks.workspace,
    auditLog: mocks.auditLog,
  },
}));

vi.mock('@/server/invitations/accept-invitation', () => ({
  acceptInvitation: mocks.acceptInvitation,
  acceptPendingInvitations: mocks.acceptPendingInvitations,
}));

vi.mock('@/server/audit/log', () => ({
  auditLog: mocks.auditLogFn,
  AuditAction: {
    OAUTH_LOGIN: 'OAUTH_LOGIN',
    ACCOUNT_CREATED: 'ACCOUNT_CREATED',
    INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  },
}));

import { GET } from './route';

function createRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET', headers });
}

describe('auth/callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    mocks.acceptPendingInvitations.mockResolvedValue(false);
    mocks.acceptInvitation.mockResolvedValue(undefined);
    mocks.workspaceMember.findFirst.mockResolvedValue(null);
    mocks.workspaceMember.count.mockResolvedValue(0);
    mocks.workspace.upsert.mockResolvedValue({ id: 'ws-1' });
    mocks.workspaceMember.create.mockResolvedValue({});
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.upsert.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            user_metadata: { name: 'Test User', avatar_url: null },
            app_metadata: { provider: 'google' },
          },
        },
      },
    });
  });

  describe('missing code', () => {
    it('redirects to origin with no code param', async () => {
      const req = createRequest('http://localhost/api/auth/callback');
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/');
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(mocks.user.upsert).not.toHaveBeenCalled();
    });

    it('redirects to origin when code is empty string', async () => {
      const req = createRequest('http://localhost/api/auth/callback?code=');
      const res = await GET(req);
      expect(res.status).toBe(307);
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  describe('successful code exchange', () => {
    it('exchanges code, creates user, audits ACCOUNT_CREATED for new user, redirects to origin', async () => {
      const req = createRequest('http://localhost/api/auth/callback?code=abc123');
      const res = await GET(req);

      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
      expect(mocks.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          create: expect.objectContaining({
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
          }),
        })
      );
      expect(mocks.auditLogFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'ACCOUNT_CREATED',
          email: 'test@example.com',
          userId: 'user-1',
          metadata: { provider: 'google' },
        })
      );
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/');
    });

    it('audits OAUTH_LOGIN (not ACCOUNT_CREATED) when user already exists', async () => {
      mocks.user.findUnique.mockResolvedValue({ id: 'user-1' });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      const auditCall = mocks.auditLogFn.mock.calls[0]?.[1];
      expect(auditCall?.action).toBe('OAUTH_LOGIN');
    });

    it('forwards client IP and user-agent to audit log', async () => {
      const req = createRequest('http://localhost/api/auth/callback?code=abc', {
        'x-forwarded-for': '203.0.113.7',
        'user-agent': 'TestBrowser/1.0',
      });
      await GET(req);

      const auditCall = mocks.auditLogFn.mock.calls[0]?.[1];
      expect(auditCall?.ipAddress).toBe('203.0.113.7');
      expect(auditCall?.userAgent).toBe('TestBrowser/1.0');
    });

    it('falls back to email-prefix as name when user_metadata.name missing', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-2',
              email: 'someone@example.com',
              user_metadata: {},
              app_metadata: {},
            },
          },
        },
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      expect(mocks.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: 'someone' }),
        })
      );
    });

    it('defaults provider to "oauth" when app_metadata.provider missing', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-2',
              email: 'a@b.com',
              user_metadata: {},
              app_metadata: {},
            },
          },
        },
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      const auditCall = mocks.auditLogFn.mock.calls[0]?.[1];
      expect(auditCall?.metadata).toEqual({ provider: 'oauth' });
    });
  });

  describe('null session (invalid code)', () => {
    it('redirects to origin without creating user when session is null', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: null } });

      const req = createRequest('http://localhost/api/auth/callback?code=bad');
      const res = await GET(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/');
      expect(mocks.user.upsert).not.toHaveBeenCalled();
      expect(mocks.auditLogFn).not.toHaveBeenCalled();
    });
  });

  describe('invitation token flow', () => {
    it('accepts a valid invitation token and redirects to origin (skipping default-workspace flow)', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      mocks.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        token: 'tok-abc',
        email: 'test@example.com',
        acceptedAt: null,
        expiresAt: futureDate,
        workspaceId: 'ws-other',
        role: 'MEMBER',
        projectIds: [],
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc&invitation=tok-abc');
      const res = await GET(req);

      expect(mocks.acceptInvitation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'inv-1' }),
        'user-1'
      );
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/');
      // Should NOT hit default-workspace flow when invitation is accepted
      expect(mocks.workspace.upsert).not.toHaveBeenCalled();
    });

    it('does not accept invitation if email does not match', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      mocks.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'other@example.com',
        acceptedAt: null,
        expiresAt: futureDate,
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc&invitation=tok-abc');
      await GET(req);

      expect(mocks.acceptInvitation).not.toHaveBeenCalled();
      // Falls through to acceptPendingInvitations
      expect(mocks.acceptPendingInvitations).toHaveBeenCalled();
    });

    it('does not accept expired invitation', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      mocks.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'test@example.com',
        acceptedAt: null,
        expiresAt: pastDate,
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc&invitation=tok-abc');
      await GET(req);

      expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    });

    it('does not re-accept already-accepted invitation', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      mocks.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'test@example.com',
        acceptedAt: new Date(),
        expiresAt: futureDate,
      });

      const req = createRequest('http://localhost/api/auth/callback?code=abc&invitation=tok-abc');
      await GET(req);

      expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    });
  });

  describe('default workspace flow (no invitation)', () => {
    it('adds new user as ADMIN of house-money workspace when it has no members', async () => {
      mocks.workspaceMember.count.mockResolvedValue(0);
      mocks.workspace.upsert.mockResolvedValue({ id: 'ws-house-money' });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      expect(mocks.workspace.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'house-money' },
          create: { name: 'House Money', slug: 'house-money' },
        })
      );
      expect(mocks.workspaceMember.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-house-money',
          userId: 'user-1',
          role: 'ADMIN',
        },
      });
    });

    it('adds subsequent users as MEMBER role', async () => {
      mocks.workspaceMember.count.mockResolvedValue(5);
      mocks.workspace.upsert.mockResolvedValue({ id: 'ws-house-money' });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      expect(mocks.workspaceMember.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-house-money',
          userId: 'user-1',
          role: 'MEMBER',
        },
      });
    });

    it('does not add to default workspace if user is already a member of any workspace', async () => {
      mocks.workspaceMember.findFirst.mockResolvedValue({ id: 'm-1' });

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      expect(mocks.workspace.upsert).not.toHaveBeenCalled();
      expect(mocks.workspaceMember.create).not.toHaveBeenCalled();
    });

    it('skips default workspace flow when pending invitations were auto-accepted', async () => {
      mocks.acceptPendingInvitations.mockResolvedValue(true);

      const req = createRequest('http://localhost/api/auth/callback?code=abc');
      await GET(req);

      expect(mocks.workspace.upsert).not.toHaveBeenCalled();
      expect(mocks.workspaceMember.create).not.toHaveBeenCalled();
    });
  });

  describe('redirect target', () => {
    it('redirects to the request origin (preserves host/port)', async () => {
      const req = createRequest('http://localhost:3001/api/auth/callback?code=abc');
      const res = await GET(req);
      expect(res.headers.get('location')).toBe('http://localhost:3001/');
    });

    it('uses https origin when request URL is https', async () => {
      const req = createRequest('https://app.example.com/api/auth/callback?code=abc');
      const res = await GET(req);
      expect(res.headers.get('location')).toBe('https://app.example.com/');
    });
  });
});
