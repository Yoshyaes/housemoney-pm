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

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => true),
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
import { auditRouter } from '@/server/trpc/routers/audit';
import { rateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/server/audit/log';
import { requireWorkspaceAdmin } from '@/server/trpc/trpc';

const appRouter = mockRouter({ audit: auditRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('audit router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    (rateLimit as any).mockResolvedValue(true);
    db = createMockPrisma();
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('list', () => {
    it('returns logs scoped to workspace, newest first', async () => {
      const items = [{ id: 'a-1', action: 'LOGIN_SUCCESS', workspaceId: 'ws-1' }];
      db.auditLog.findMany.mockResolvedValue(items);

      const result = await caller.audit.list({ workspaceId: 'ws-1' });

      expect(requireWorkspaceAdmin).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'user-1');
      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { createdAt: 'desc' },
          take: 51,
        })
      );
      expect(result).toEqual({ items, nextCursor: undefined });
    });

    it('filters by action when provided', async () => {
      db.auditLog.findMany.mockResolvedValue([]);
      await caller.audit.list({ workspaceId: 'ws-1', action: 'LOGIN_FAILED' });
      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', action: 'LOGIN_FAILED' },
        })
      );
    });

    it('filters by email case-insensitively', async () => {
      db.auditLog.findMany.mockResolvedValue([]);
      await caller.audit.list({ workspaceId: 'ws-1', email: 'foo@bar.com' });
      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', email: { contains: 'foo@bar.com', mode: 'insensitive' } },
        })
      );
    });

    it('returns nextCursor when more items than limit', async () => {
      const many = Array.from({ length: 51 }, (_, i) => ({ id: `a-${i}`, action: 'LOGIN_SUCCESS' }));
      db.auditLog.findMany.mockResolvedValue(many);

      const result = await caller.audit.list({ workspaceId: 'ws-1' });

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBe('a-50');
    });

    it('applies cursor with skip:1 to skip the cursor row', async () => {
      db.auditLog.findMany.mockResolvedValue([]);
      await caller.audit.list({ workspaceId: 'ws-1', cursor: 'a-99' });
      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'a-99' }, skip: 1 })
      );
    });

    it('rejects non-admins (FORBIDDEN)', async () => {
      (requireWorkspaceAdmin as any).mockRejectedValueOnce(
        new TRPCError({ code: 'FORBIDDEN', message: 'admin only' })
      );
      await expect(caller.audit.list({ workspaceId: 'ws-1' })).rejects.toThrow(/admin only/);
    });

    it('validates limit max=100', async () => {
      await expect(
        caller.audit.list({ workspaceId: 'ws-1', limit: 101 })
      ).rejects.toThrow();
    });

    it('validates limit min=1', async () => {
      await expect(
        caller.audit.list({ workspaceId: 'ws-1', limit: 0 })
      ).rejects.toThrow();
    });
  });

  describe('logAuth', () => {
    it('records a login success entry', async () => {
      const result = await caller.audit.logAuth({
        action: 'LOGIN_SUCCESS',
        email: 'a@b.com',
      });
      expect(rateLimit).toHaveBeenCalledWith('audit:a@b.com', 10, 60_000);
      expect(auditLog).toHaveBeenCalledWith(expect.anything(), {
        action: 'LOGIN_SUCCESS',
        email: 'a@b.com',
        metadata: undefined,
      });
      expect(result).toEqual({ success: true });
    });

    it('passes metadata through', async () => {
      await caller.audit.logAuth({
        action: 'SIGNUP',
        email: 'a@b.com',
        metadata: { source: 'web' },
      });
      expect(auditLog).toHaveBeenCalledWith(expect.anything(), {
        action: 'SIGNUP',
        email: 'a@b.com',
        metadata: { source: 'web' },
      });
    });

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      (rateLimit as any).mockResolvedValueOnce(false);
      await expect(
        caller.audit.logAuth({ action: 'LOGIN_FAILED', email: 'a@b.com' })
      ).rejects.toThrow(/Too many requests/);
      expect(auditLog).not.toHaveBeenCalled();
    });

    it('rejects unsupported actions', async () => {
      await expect(
        caller.audit.logAuth({ action: 'NOT_AN_ACTION' as any, email: 'a@b.com' })
      ).rejects.toThrow();
    });

    it('rejects malformed email', async () => {
      await expect(
        caller.audit.logAuth({ action: 'LOGIN_SUCCESS', email: 'not-an-email' })
      ).rejects.toThrow();
    });
  });
});
