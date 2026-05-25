import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

const defaultMembership = { id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' as const };
vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
  requireWorkspaceMember: vi.fn(async () => defaultMembership),
  requireWorkspaceAdmin: vi.fn(async () => defaultMembership),
  requireNonGuest: vi.fn(async () => defaultMembership),
  requireProjectAccess: vi.fn(async () => ({ membership: defaultMembership, project: { id: 'proj-1', workspaceId: 'ws-1' } })),
  getAccessibleProjectIds: vi.fn(async () => null),
}));

vi.mock('@/server/invitations/accept-invitation', () => ({
  acceptInvitation: vi.fn(async () => undefined),
  acceptPendingInvitations: vi.fn(async () => false),
}));

vi.mock('@/server/invitations/send-invite-email', () => ({
  sendInviteEmail: vi.fn(async () => ({ emailSent: true })),
}));

vi.mock('@/server/audit/log', async () => {
  const actual = await vi.importActual<typeof import('@/server/audit/log')>('@/server/audit/log');
  return {
    ...actual,
    auditLog: vi.fn(async () => undefined),
  };
});

import { TRPCError } from '@trpc/server';
import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';
import { testUser } from '@/test/helpers/fixtures';
import { invitationsRouter } from '@/server/trpc/routers/invitations';
import { requireNonGuest } from '@/server/trpc/trpc';
import { acceptInvitation } from '@/server/invitations/accept-invitation';
import { sendInviteEmail } from '@/server/invitations/send-invite-email';
import { auditLog } from '@/server/audit/log';

const appRouter = mockRouter({ invitations: invitationsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('invitations router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrisma();
    (sendInviteEmail as any).mockResolvedValue({ emailSent: true });
    (acceptInvitation as any).mockResolvedValue(undefined);
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('create', () => {
    it('rejects guests creating invitations', async () => {
      (requireNonGuest as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(
        caller.invitations.create({ workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER' })
      ).rejects.toThrow();
    });

    it('rejects GUEST role without projectIds', async () => {
      await expect(
        caller.invitations.create({
          workspaceId: 'ws-1',
          email: 'new@x.com',
          role: 'GUEST',
          projectIds: [],
        })
      ).rejects.toThrow(/at least one project/);
    });

    it('rejects when user already a workspace member', async () => {
      db.user.findUnique.mockResolvedValueOnce({ id: 'user-2', email: 'sarah@test.com' });
      db.workspaceMember.findUnique.mockResolvedValueOnce({ id: 'm-2' });
      await expect(
        caller.invitations.create({ workspaceId: 'ws-1', email: 'sarah@test.com', role: 'MEMBER' })
      ).rejects.toThrow(/already a workspace member/);
    });

    it('rejects when a pending invitation exists', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: null, expiresAt: new Date(Date.now() + 86400000),
      });
      await expect(
        caller.invitations.create({ workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER' })
      ).rejects.toThrow(/already pending/);
    });

    it('deletes previously accepted invite to allow re-invite', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-old', acceptedAt: new Date(),
      });
      db.invitation.delete.mockResolvedValueOnce({});
      db.invitation.create.mockResolvedValueOnce({
        id: 'i-new', token: 'abc', workspaceId: 'ws-1', invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      });

      await caller.invitations.create({
        workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER',
      });

      expect(db.invitation.delete).toHaveBeenCalledWith({ where: { id: 'i-old' } });
      expect(db.invitation.create).toHaveBeenCalled();
    });

    it('generates a cryptographically secure 64-hex-char token', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce(null);
      db.invitation.create.mockResolvedValueOnce({
        id: 'i-new', token: 'unused', workspaceId: 'ws-1',
        invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      });

      await caller.invitations.create({
        workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER',
      });

      const call = db.invitation.create.mock.calls[0][0];
      expect(call.data.token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates a different token on each call', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.invitation.findUnique.mockResolvedValue(null);
      db.invitation.create.mockResolvedValue({
        id: 'i-new', token: 'unused', workspaceId: 'ws-1',
        invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      });

      await caller.invitations.create({ workspaceId: 'ws-1', email: 'a@x.com', role: 'MEMBER' });
      await caller.invitations.create({ workspaceId: 'ws-1', email: 'b@x.com', role: 'MEMBER' });

      const t1 = db.invitation.create.mock.calls[0][0].data.token;
      const t2 = db.invitation.create.mock.calls[1][0].data.token;
      expect(t1).not.toEqual(t2);
    });

    it('sets expiry exactly 7 days in the future', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce(null);
      db.invitation.create.mockResolvedValueOnce({
        id: 'i-new', token: 'x', workspaceId: 'ws-1',
        invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      });

      const before = Date.now();
      await caller.invitations.create({ workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER' });
      const after = Date.now();

      const expiresAt: Date = db.invitation.create.mock.calls[0][0].data.expiresAt;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDays);
    });

    it('records an audit log entry', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce(null);
      db.invitation.create.mockResolvedValueOnce({
        id: 'i-new', token: 'x', workspaceId: 'ws-1',
        invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      });

      await caller.invitations.create({
        workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER',
      });

      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'INVITATION_SENT',
          email: 'new@x.com',
          workspaceId: 'ws-1',
          metadata: expect.objectContaining({ role: 'MEMBER' }),
        })
      );
    });

    it('auto-accepts and returns when invited user already has an account', async () => {
      db.user.findUnique.mockResolvedValueOnce({ id: 'user-9', email: 'new@x.com' });
      db.workspaceMember.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce(null);
      const invitation = {
        id: 'i-new', token: 'x', workspaceId: 'ws-1',
        invitedBy: { name: 'F', email: 'f@x.com' }, workspace: { name: 'W' },
      };
      db.invitation.create.mockResolvedValueOnce(invitation);
      db.invitation.findUniqueOrThrow.mockResolvedValueOnce({ ...invitation, acceptedAt: new Date() });

      const result = await caller.invitations.create({
        workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER',
      });

      expect(acceptInvitation).toHaveBeenCalled();
      expect(sendInviteEmail).not.toHaveBeenCalled();
      expect((result as any).acceptedAt).toBeInstanceOf(Date);
    });

    it('sends invite email for new users not yet in DB', async () => {
      db.user.findUnique.mockResolvedValueOnce(null);
      db.invitation.findUnique.mockResolvedValueOnce(null);
      db.invitation.create.mockResolvedValueOnce({
        id: 'i-new', token: 'tok', workspaceId: 'ws-1', role: 'MEMBER',
        invitedBy: { name: 'Inviter', email: 'inv@x.com' }, workspace: { name: 'W' },
      });

      const result = await caller.invitations.create({
        workspaceId: 'ws-1', email: 'new@x.com', role: 'MEMBER',
      });

      expect(sendInviteEmail).toHaveBeenCalledWith({
        email: 'new@x.com',
        role: 'MEMBER',
        workspaceName: 'W',
        inviterName: 'Inviter',
        inviteToken: 'tok',
      });
      expect((result as any).emailSent).toBe(true);
    });

    it('rejects malformed email', async () => {
      await expect(
        caller.invitations.create({ workspaceId: 'ws-1', email: 'not-an-email', role: 'MEMBER' })
      ).rejects.toThrow();
    });
  });

  describe('accept', () => {
    it('accepts a valid invitation for matching email', async () => {
      const invitation = {
        id: 'i-1', token: 't', email: 'fred@test.com', acceptedAt: null,
        expiresAt: new Date(Date.now() + 86400000), workspaceId: 'ws-1',
      };
      db.invitation.findUnique.mockResolvedValueOnce(invitation);

      const result = await caller.invitations.accept({ token: 't' });

      expect(acceptInvitation).toHaveBeenCalled();
      expect(result).toEqual({ success: true, workspaceId: 'ws-1' });
    });

    it('rejects unknown token (NOT_FOUND)', async () => {
      db.invitation.findUnique.mockResolvedValueOnce(null);
      await expect(caller.invitations.accept({ token: 'bad' })).rejects.toThrow(/Invitation not found/);
    });

    it('rejects already-accepted invitations', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', token: 't', acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), email: 'fred@test.com',
      });
      await expect(caller.invitations.accept({ token: 't' })).rejects.toThrow(/already been accepted/);
    });

    it('rejects expired invitations', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', token: 't', acceptedAt: null,
        expiresAt: new Date(Date.now() - 1000), email: 'fred@test.com',
      });
      await expect(caller.invitations.accept({ token: 't' })).rejects.toThrow(/expired/);
    });

    it('rejects when invitation email differs from ctx user email', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', token: 't', acceptedAt: null,
        expiresAt: new Date(Date.now() + 86400000), email: 'someone-else@x.com',
      });
      await expect(caller.invitations.accept({ token: 't' })).rejects.toThrow(/different email address/);
      expect(acceptInvitation).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns only pending non-expired invitations', async () => {
      const invites = [{ id: 'i-1', email: 'a@x.com' }];
      db.invitation.findMany.mockResolvedValue(invites);

      const result = await caller.invitations.list({ workspaceId: 'ws-1' });

      expect(requireNonGuest).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'user-1');
      const call = db.invitation.findMany.mock.calls[0][0];
      expect(call.where.workspaceId).toBe('ws-1');
      expect(call.where.acceptedAt).toBeNull();
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(result).toEqual(invites);
    });

    it('rejects guests', async () => {
      (requireNonGuest as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.invitations.list({ workspaceId: 'ws-1' })).rejects.toThrow();
    });
  });

  describe('resend', () => {
    it('throws NOT_FOUND when invitation missing', async () => {
      db.invitation.findUnique.mockResolvedValueOnce(null);
      await expect(caller.invitations.resend({ id: 'x' })).rejects.toThrow(/not found/i);
    });

    it('rejects when invitation already accepted', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: new Date(), workspaceId: 'ws-1',
        workspace: { name: 'W' }, invitedBy: { name: 'Inv' },
      });
      await expect(caller.invitations.resend({ id: 'i-1' })).rejects.toThrow(/already been accepted/);
    });

    it('extends expiry when invitation is close to expiring', async () => {
      // less than 24h remaining
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        workspaceId: 'ws-1', email: 'a@x.com', role: 'MEMBER', token: 'tok',
        workspace: { name: 'W' }, invitedBy: { name: 'Inv' },
      });
      db.invitation.update.mockResolvedValueOnce({});

      await caller.invitations.resend({ id: 'i-1' });

      expect(db.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'i-1' },
          data: expect.objectContaining({ expiresAt: expect.any(Date) }),
        })
      );
    });

    it('does not extend expiry if more than 24h remain', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: null,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
        workspaceId: 'ws-1', email: 'a@x.com', role: 'MEMBER', token: 'tok',
        workspace: { name: 'W' }, invitedBy: { name: 'Inv' },
      });

      await caller.invitations.resend({ id: 'i-1' });

      expect(db.invitation.update).not.toHaveBeenCalled();
    });

    it('throws INTERNAL_SERVER_ERROR when email fails', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: null,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        workspaceId: 'ws-1', email: 'a@x.com', role: 'MEMBER', token: 'tok',
        workspace: { name: 'W' }, invitedBy: { name: 'Inv' },
      });
      (sendInviteEmail as any).mockResolvedValueOnce({ emailSent: false });

      await expect(caller.invitations.resend({ id: 'i-1' })).rejects.toThrow(/Failed to send email/);
    });

    it('rejects guests', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({
        id: 'i-1', acceptedAt: null,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        workspaceId: 'ws-1', email: 'a@x.com', role: 'MEMBER', token: 'tok',
        workspace: { name: 'W' }, invitedBy: { name: 'Inv' },
      });
      (requireNonGuest as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.invitations.resend({ id: 'i-1' })).rejects.toThrow();
    });
  });

  describe('revoke', () => {
    it('deletes the invitation', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({ id: 'i-1', workspaceId: 'ws-1' });
      db.invitation.delete.mockResolvedValueOnce({ id: 'i-1' });

      const result = await caller.invitations.revoke({ id: 'i-1' });

      expect(requireNonGuest).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'user-1');
      expect(db.invitation.delete).toHaveBeenCalledWith({ where: { id: 'i-1' } });
      expect(result).toEqual({ id: 'i-1' });
    });

    it('throws NOT_FOUND when missing', async () => {
      db.invitation.findUnique.mockResolvedValueOnce(null);
      await expect(caller.invitations.revoke({ id: 'x' })).rejects.toThrow(/not found/i);
    });

    it('rejects guests', async () => {
      db.invitation.findUnique.mockResolvedValueOnce({ id: 'i-1', workspaceId: 'ws-1' });
      (requireNonGuest as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.invitations.revoke({ id: 'i-1' })).rejects.toThrow();
    });
  });
});
