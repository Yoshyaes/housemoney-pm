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

import { projectsRouter } from './projects';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    db: {
      project: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    },
    ...overrides,
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(projectsRouter)(ctx);

describe('projectsRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('calculates progress correctly (2 done out of 4 = 50%)', async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Project A',
          _count: { tasks: 4 },
          tasks: [
            { status: 'DONE' },
            { status: 'DONE' },
            { status: 'IN_PROGRESS' },
            { status: 'TODO' },
          ],
        },
      ]);

      const result = await caller(ctx).list({ workspaceId: 'ws-1' });

      expect(result[0].progress).toBe(50);
      expect(result[0]).not.toHaveProperty('tasks');
    });

    it('returns 0% progress for project with 0 tasks', async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Empty Project',
          _count: { tasks: 0 },
          tasks: [],
        },
      ]);

      const result = await caller(ctx).list({ workspaceId: 'ws-1' });

      expect(result[0].progress).toBe(0);
    });

    it('returns 100% for all done tasks', async () => {
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Complete Project',
          _count: { tasks: 3 },
          tasks: [
            { status: 'DONE' },
            { status: 'DONE' },
            { status: 'DONE' },
          ],
        },
      ]);

      const result = await caller(ctx).list({ workspaceId: 'ws-1' });

      expect(result[0].progress).toBe(100);
    });
  });

  describe('create', () => {
    it('creates a project', async () => {
      const input = { workspaceId: 'ws-1', name: 'New Project', description: 'desc' };
      ctx.db.project.create.mockResolvedValue({ id: 'p-new', ...input });

      const result = await caller(ctx).create(input);

      expect(ctx.db.project.create).toHaveBeenCalledWith({ data: input });
      expect(result).toHaveProperty('id', 'p-new');
    });
  });

  describe('update', () => {
    it('updates project fields', async () => {
      const updated = { id: 'p1', name: 'Updated', status: 'PAUSED' };
      ctx.db.project.update.mockResolvedValue(updated);

      const result = await caller(ctx).update({ id: 'p1', name: 'Updated', status: 'PAUSED' });

      expect(ctx.db.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Updated', status: 'PAUSED' },
      });
      expect(result).toEqual(updated);
    });
  });
});
