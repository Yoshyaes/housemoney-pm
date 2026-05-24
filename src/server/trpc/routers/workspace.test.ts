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

import { workspaceRouter } from './workspace';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    db: {
      workspaceMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      label: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    ...overrides,
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(workspaceRouter)(ctx);

describe('workspaceRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  describe('getCurrent', () => {
    it('returns workspace when membership exists', async () => {
      const workspace = { id: 'ws-1', name: 'House Money', slug: 'house-money' };
      ctx.db.workspaceMember.findFirst.mockResolvedValue({
        userId: 'user-1',
        workspaceId: 'ws-1',
        workspace,
      });

      const result = await caller(ctx).getCurrent();

      expect(result).toEqual(workspace);
      expect(ctx.db.workspaceMember.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { workspace: true },
      });
    });

    it('returns null if no membership found', async () => {
      ctx.db.workspaceMember.findFirst.mockResolvedValue(null);

      const result = await caller(ctx).getCurrent();

      expect(result).toBeNull();
    });
  });

  describe('getMembers', () => {
    it('returns flattened members with role', async () => {
      ctx.db.workspaceMember.findMany.mockResolvedValue([
        {
          role: 'ADMIN',
          user: { id: 'user-1', name: 'Alice', email: 'alice@test.com' },
        },
        {
          role: 'MEMBER',
          user: { id: 'user-2', name: 'Bob', email: 'bob@test.com' },
        },
      ]);

      const result = await caller(ctx).getMembers({ workspaceId: 'ws-1' });

      expect(result).toEqual([
        { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'ADMIN' },
        { id: 'user-2', name: 'Bob', email: 'bob@test.com', role: 'MEMBER' },
      ]);
    });
  });

  describe('getLabels', () => {
    it('returns labels ordered by name', async () => {
      const labels = [
        { id: 'l1', name: 'Bug', color: 'red' },
        { id: 'l2', name: 'Feature', color: 'blue' },
      ];
      ctx.db.label.findMany.mockResolvedValue(labels);

      const result = await caller(ctx).getLabels({ workspaceId: 'ws-1' });

      expect(result).toEqual(labels);
      expect(ctx.db.label.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { name: 'asc' },
      });
    });
  });
});
