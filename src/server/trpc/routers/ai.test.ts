import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@/server/ai/parse-task', () => ({
  parseTaskFromNaturalLanguage: vi.fn(),
  triageTask: vi.fn(),
  fuzzyMatchMember: vi.fn(),
  fuzzyMatchProject: vi.fn(),
  fuzzyMatchLabels: vi.fn(),
}));

import { aiRouter } from './ai';
import {
  parseTaskFromNaturalLanguage,
  triageTask,
  fuzzyMatchMember,
  fuzzyMatchProject,
  fuzzyMatchLabels,
} from '@/server/ai/parse-task';
import { TRPCError } from '@trpc/server';

const mockParseTask = parseTaskFromNaturalLanguage as ReturnType<typeof vi.fn>;
const mockTriageTask = triageTask as ReturnType<typeof vi.fn>;
const mockFuzzyMatchMember = fuzzyMatchMember as ReturnType<typeof vi.fn>;
const mockFuzzyMatchProject = fuzzyMatchProject as ReturnType<typeof vi.fn>;
const mockFuzzyMatchLabels = fuzzyMatchLabels as ReturnType<typeof vi.fn>;

function createMockCtx() {
  return {
    userId: 'user-1',
    db: {
      workspaceMember: {
        findMany: vi.fn().mockResolvedValue([
          { user: { id: 'user-1', name: 'Alice' } },
          { user: { id: 'user-2', name: 'Bob' } },
        ]),
      },
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'proj-1', name: 'Backend' },
        ]),
      },
      label: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'lbl-1', name: 'Bug' },
          { id: 'lbl-2', name: 'Feature' },
        ]),
      },
    },
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(aiRouter)(ctx);

describe('aiRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let originalKey: string | undefined;

  beforeEach(() => {
    ctx = createMockCtx();
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.clearAllMocks();

    // Default mock returns
    mockFuzzyMatchMember.mockReturnValue(null);
    mockFuzzyMatchProject.mockReturnValue(null);
    mockFuzzyMatchLabels.mockReturnValue([]);
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  describe('parseTask', () => {
    it('throws when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        caller(ctx).parseTask({ text: 'Create a task', workspaceId: 'ws-1' })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller(ctx).parseTask({ text: 'Create a task', workspaceId: 'ws-1' })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });

    it('fetches workspace context and calls parseTaskFromNaturalLanguage', async () => {
      mockParseTask.mockResolvedValue({
        title: 'Fix login bug',
        description: null,
        assigneeName: null,
        projectName: null,
        labelNames: [],
        status: 'TODO',
        priority: 'HIGH',
        dueDateISO: null,
      });

      await caller(ctx).parseTask({ text: 'Fix login bug', workspaceId: 'ws-1' });

      expect(ctx.db.workspaceMember.findMany).toHaveBeenCalled();
      expect(ctx.db.project.findMany).toHaveBeenCalled();
      expect(ctx.db.label.findMany).toHaveBeenCalled();
      expect(mockParseTask).toHaveBeenCalledWith(
        'Fix login bug',
        expect.objectContaining({
          members: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
          projects: [{ id: 'proj-1', name: 'Backend' }],
          labels: [{ id: 'lbl-1', name: 'Bug' }, { id: 'lbl-2', name: 'Feature' }],
          currentDate: expect.any(String),
        })
      );
    });

    it('resolves fuzzy matches and returns structured result', async () => {
      mockParseTask.mockResolvedValue({
        title: 'Fix login bug',
        description: 'The login form crashes',
        assigneeName: 'Alice',
        projectName: 'Backend',
        labelNames: ['Bug'],
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueDateISO: '2026-03-20',
      });
      mockFuzzyMatchMember.mockReturnValue('user-1');
      mockFuzzyMatchProject.mockReturnValue('proj-1');
      mockFuzzyMatchLabels.mockReturnValue(['lbl-1']);

      const result = await caller(ctx).parseTask({ text: 'Fix login bug assigned to Alice', workspaceId: 'ws-1' });

      expect(result).toEqual({
        title: 'Fix login bug',
        description: 'The login form crashes',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assigneeId: 'user-1',
        assigneeName: 'Alice',
        projectId: 'proj-1',
        projectName: 'Backend',
        dueDate: '2026-03-20',
        labelIds: ['lbl-1'],
        labelNames: ['Bug'],
        _unmatched: {
          assignee: null,
          project: null,
          labels: [],
        },
      });
    });

    it('maps rate limit errors to TOO_MANY_REQUESTS', async () => {
      mockParseTask.mockRejectedValue(new Error('rate_limit exceeded'));

      await expect(
        caller(ctx).parseTask({ text: 'Some task', workspaceId: 'ws-1' })
      ).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      });
    });
  });

  describe('triageTask', () => {
    it('throws when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        caller(ctx).triageTask({ title: 'Fix bug', workspaceId: 'ws-1' })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller(ctx).triageTask({ title: 'Fix bug', workspaceId: 'ws-1' })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });

    it('returns suggestions with resolved IDs', async () => {
      mockTriageTask.mockResolvedValue({
        priority: 'URGENT',
        assigneeName: 'Bob',
        labelNames: ['Bug'],
        reasoning: 'This seems like a critical bug',
      });
      mockFuzzyMatchMember.mockReturnValue('user-2');
      mockFuzzyMatchLabels.mockReturnValue(['lbl-1']);

      const result = await caller(ctx).triageTask({ title: 'Login page is broken', workspaceId: 'ws-1' });

      expect(result).toEqual({
        priority: 'URGENT',
        assigneeId: 'user-2',
        assigneeName: 'Bob',
        labelIds: ['lbl-1'],
        labelNames: ['Bug'],
        reasoning: 'This seems like a critical bug',
      });
      expect(mockTriageTask).toHaveBeenCalledWith(
        'Login page is broken',
        expect.objectContaining({
          members: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
          labels: [{ id: 'lbl-1', name: 'Bug' }, { id: 'lbl-2', name: 'Feature' }],
        })
      );
    });
  });
});
