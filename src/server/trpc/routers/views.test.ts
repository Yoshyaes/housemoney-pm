import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
}));

import { viewsRouter } from './views';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    db: {
      view: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
    ...overrides,
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(viewsRouter)(ctx);

describe('viewsRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns own views and workspace views', async () => {
      const views = [
        { id: 'v1', ownerId: 'user-1', scope: 'PERSONAL' },
        { id: 'v2', ownerId: 'user-2', scope: 'WORKSPACE' },
      ];
      ctx.db.view.findMany.mockResolvedValue(views);

      const result = await caller(ctx).list({ workspaceId: 'ws-1' });

      expect(result).toEqual(views);
      const callArgs = ctx.db.view.findMany.mock.calls[0][0];
      expect(callArgs.where.workspaceId).toBe('ws-1');
      expect(callArgs.where.OR).toEqual([
        { ownerId: 'user-1' },
        { scope: 'WORKSPACE' },
      ]);
    });
  });

  describe('save', () => {
    it('creates a view with ownerId', async () => {
      const input = {
        workspaceId: 'ws-1',
        name: 'My View',
        filters: {},
        sort: {},
        displayType: 'board' as const,
      };
      const created = { id: 'v-new', ...input, ownerId: 'user-1', scope: 'PERSONAL' };
      ctx.db.view.create.mockResolvedValue(created);

      const result = await caller(ctx).save(input);

      const callArgs = ctx.db.view.create.mock.calls[0][0];
      expect(callArgs.data.ownerId).toBe('user-1');
      expect(result).toEqual(created);
    });

    it('defaults scope to PERSONAL', async () => {
      const input = {
        workspaceId: 'ws-1',
        name: 'My View',
        filters: {},
        sort: {},
        displayType: 'list' as const,
      };
      ctx.db.view.create.mockResolvedValue({});

      await caller(ctx).save(input);

      const callArgs = ctx.db.view.create.mock.calls[0][0];
      expect(callArgs.data.scope).toBe('PERSONAL');
    });
  });

  describe('update', () => {
    it('updates a view', async () => {
      const updated = { id: 'v1', name: 'Renamed View' };
      ctx.db.view.update.mockResolvedValue(updated);

      const result = await caller(ctx).update({ id: 'v1', name: 'Renamed View' });

      expect(ctx.db.view.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { name: 'Renamed View' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('deletes a view', async () => {
      ctx.db.view.delete.mockResolvedValue({ id: 'v1' });

      const result = await caller(ctx).delete({ id: 'v1' });

      expect(ctx.db.view.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
      expect(result).toEqual({ id: 'v1' });
    });
  });
});
