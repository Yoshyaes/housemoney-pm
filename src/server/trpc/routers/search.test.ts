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

vi.mock('@/generated/prisma/client', () => ({
  Prisma: {
    sql: vi.fn((...args: unknown[]) => ({ strings: args[0], values: args.slice(1) })),
    join: vi.fn((arr: unknown[]) => ({ values: arr })),
    empty: { values: [] },
  },
}));

import { searchRouter } from './search';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    db: {
      $queryRaw: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(searchRouter)(ctx);

describe('searchRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  describe('global', () => {
    it('calls $queryRaw for short query (<3 chars)', async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      await caller(ctx).global({ workspaceId: 'ws-1', query: 'ab' });

      // 4 parallel queries: tasks, comments, projects, documents
      expect(ctx.db.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('calls $queryRaw for long query (3+ chars)', async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      await caller(ctx).global({ workspaceId: 'ws-1', query: 'search term' });

      expect(ctx.db.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('returns structured result with tasks, comments, projects, documents', async () => {
      const mockTasks = [{ id: 't1', title: 'Task', identifier: 'HM-1', status: 'TODO', projectId: 'p1', score: 0.9 }];
      const mockComments = [{ id: 'c1', body: 'Comment', taskId: 't1', taskIdentifier: 'HM-1', taskTitle: 'Task', score: 0.8 }];
      const mockProjects = [{ id: 'p1', name: 'Project', description: null, color: '#000', status: 'ACTIVE', score: 0.7 }];
      const mockDocuments = [{ id: 'd1', title: 'Doc', docType: 'NOTE', score: 0.6, snippet: 'snip' }];

      ctx.db.$queryRaw
        .mockResolvedValueOnce(mockTasks)
        .mockResolvedValueOnce(mockComments)
        .mockResolvedValueOnce(mockProjects)
        .mockResolvedValueOnce(mockDocuments);

      const result = await caller(ctx).global({ workspaceId: 'ws-1', query: 'search' });

      expect(result).toEqual({
        tasks: mockTasks,
        comments: mockComments,
        projects: mockProjects,
        documents: mockDocuments,
      });
    });

    it('handles whitespace-only query by returning empty results after trim', async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      const result = await caller(ctx).global({ workspaceId: 'ws-1', query: ' ' });

      expect(result).toEqual({ tasks: [], comments: [], projects: [], documents: [] });
      expect(ctx.db.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
