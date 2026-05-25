import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

const defaultMembership = { id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' as const };

const { requireWorkspaceMemberMock, getAccessibleProjectIdsMock } = vi.hoisted(() => ({
  requireWorkspaceMemberMock: vi.fn(async () => ({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' })),
  getAccessibleProjectIdsMock: vi.fn(async () => null),
}));

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
  requireWorkspaceMember: requireWorkspaceMemberMock,
  requireWorkspaceAdmin: vi.fn(async () => defaultMembership),
  requireNonGuest: vi.fn(async () => defaultMembership),
  requireProjectAccess: vi.fn(async () => ({ membership: defaultMembership, project: { id: 'proj-1', workspaceId: 'ws-1' } })),
  getAccessibleProjectIds: getAccessibleProjectIdsMock,
}));

vi.mock('@/server/ai/knowledge-query', () => ({
  findRelevantChunks: vi.fn(async () => []),
  queryKnowledgeWithClaude: vi.fn(async () => ({ answer: 'mock answer', citations: [], hasResults: true })),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => true),
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
import { findRelevantChunks, queryKnowledgeWithClaude } from '@/server/ai/knowledge-query';
import { rateLimit } from '@/lib/rate-limit';
import { TRPCError } from '@trpc/server';

const mockParseTask = parseTaskFromNaturalLanguage as ReturnType<typeof vi.fn>;
const mockTriageTask = triageTask as ReturnType<typeof vi.fn>;
const mockFuzzyMatchMember = fuzzyMatchMember as ReturnType<typeof vi.fn>;
const mockFuzzyMatchProject = fuzzyMatchProject as ReturnType<typeof vi.fn>;
const mockFuzzyMatchLabels = fuzzyMatchLabels as ReturnType<typeof vi.fn>;
const mockFindRelevantChunks = findRelevantChunks as ReturnType<typeof vi.fn>;
const mockQueryKnowledgeWithClaude = queryKnowledgeWithClaude as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

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
    mockRateLimit.mockResolvedValue(true);
    requireWorkspaceMemberMock.mockResolvedValue({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' });
    getAccessibleProjectIdsMock.mockResolvedValue(null);
    mockFindRelevantChunks.mockResolvedValue([]);
    mockQueryKnowledgeWithClaude.mockResolvedValue({
      answer: 'mock answer',
      citations: [],
      hasResults: true,
    });
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

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      mockRateLimit.mockResolvedValue(false);

      await expect(
        caller(ctx).triageTask({ title: 'Fix', workspaceId: 'ws-1' })
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('returns null reasoning when triageTask omits it', async () => {
      mockTriageTask.mockResolvedValue({
        priority: 'LOW',
        assigneeName: null,
        labelNames: [],
      });

      const result = await caller(ctx).triageTask({ title: 'Trivial', workspaceId: 'ws-1' });
      expect(result.reasoning).toBeNull();
    });

    it('maps generic errors to INTERNAL_SERVER_ERROR', async () => {
      mockTriageTask.mockRejectedValue(new Error('something broke'));

      await expect(
        caller(ctx).triageTask({ title: 'Test', workspaceId: 'ws-1' })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });
  });

  describe('queryKnowledge', () => {
    it('throws when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'How does auth work?' })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });

    it('throws TOO_MANY_REQUESTS when rate-limited', async () => {
      mockRateLimit.mockResolvedValue(false);

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q?' })
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('returns helpful message when no relevant chunks found', async () => {
      mockFindRelevantChunks.mockResolvedValue([]);

      const result = await caller(ctx).queryKnowledge({
        workspaceId: 'ws-1',
        question: 'unknown',
      });

      expect(result).toEqual({
        answer: expect.stringContaining('No relevant documents'),
        citations: [],
        hasResults: false,
      });
      expect(mockQueryKnowledgeWithClaude).not.toHaveBeenCalled();
    });

    it('calls queryKnowledgeWithClaude with chunks', async () => {
      mockFindRelevantChunks.mockResolvedValue([
        { id: 'd1', title: 'Doc', docType: 'NOTE', tags: [], updatedAt: new Date(), chunk: 'content', score: 0.9 },
      ]);
      mockQueryKnowledgeWithClaude.mockResolvedValue({
        answer: 'Here is the answer',
        citations: [{ docId: 'd1', title: 'Doc', snippet: 'content', score: 0.9 }],
        hasResults: true,
      });

      const result = await caller(ctx).queryKnowledge({
        workspaceId: 'ws-1',
        question: 'What is auth?',
      });

      expect(mockQueryKnowledgeWithClaude).toHaveBeenCalledWith(
        'What is auth?',
        expect.any(Array)
      );
      expect(result.answer).toBe('Here is the answer');
      expect(result.citations).toHaveLength(1);
    });

    // CRITICAL: guest scoping
    describe('guest scoping', () => {
      it('passes allowedProjectIds=null when user is ADMIN', async () => {
        requireWorkspaceMemberMock.mockResolvedValue({
          id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN',
        });

        await caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' });

        expect(mockFindRelevantChunks).toHaveBeenCalledWith(
          'q',
          'ws-1',
          ctx.db,
          5,
          null, // no scoping for admins
        );
        expect(getAccessibleProjectIdsMock).not.toHaveBeenCalled();
      });

      it('passes allowedProjectIds=null when user is MEMBER', async () => {
        requireWorkspaceMemberMock.mockResolvedValue({
          id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'MEMBER',
        });

        await caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' });

        expect(mockFindRelevantChunks).toHaveBeenCalledWith(
          'q', 'ws-1', ctx.db, 5, null
        );
      });

      it('passes accessible project ids when user is GUEST', async () => {
        requireWorkspaceMemberMock.mockResolvedValue({
          id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'GUEST',
        });
        getAccessibleProjectIdsMock.mockResolvedValue(['proj-1', 'proj-3']);

        await caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' });

        expect(getAccessibleProjectIdsMock).toHaveBeenCalledWith(ctx.db, 'ws-1', 'user-1');
        expect(mockFindRelevantChunks).toHaveBeenCalledWith(
          'q', 'ws-1', ctx.db, 5, ['proj-1', 'proj-3']
        );
      });

      it('passes empty array when guest has zero accessible projects', async () => {
        requireWorkspaceMemberMock.mockResolvedValue({
          id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'GUEST',
        });
        getAccessibleProjectIdsMock.mockResolvedValue([]);

        await caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' });

        expect(mockFindRelevantChunks).toHaveBeenCalledWith(
          'q', 'ws-1', ctx.db, 5, [] // empty array, not null
        );
      });
    });

    it('maps rate_limit errors to TOO_MANY_REQUESTS', async () => {
      mockFindRelevantChunks.mockRejectedValue(new Error('rate_limit hit'));

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' })
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('maps 429 errors to TOO_MANY_REQUESTS', async () => {
      mockFindRelevantChunks.mockRejectedValue(new Error('Got 429 from upstream'));

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' })
      ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('maps generic errors to INTERNAL_SERVER_ERROR', async () => {
      mockFindRelevantChunks.mockRejectedValue(new Error('database down'));

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    });

    it('passes through TRPCError unchanged', async () => {
      mockFindRelevantChunks.mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'specific' })
      );

      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'q' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('validates question length max 1000 chars', async () => {
      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: 'a'.repeat(1001) })
      ).rejects.toThrow();
    });

    it('validates question is non-empty', async () => {
      await expect(
        caller(ctx).queryKnowledge({ workspaceId: 'ws-1', question: '' })
      ).rejects.toThrow();
    });
  });

  describe('parseTask guest scoping', () => {
    it('uses unrestricted project list when getAccessibleProjectIds returns null', async () => {
      mockParseTask.mockResolvedValue({
        title: 't', description: null, assigneeName: null,
        projectName: null, labelNames: [], status: 'TODO', priority: 'NONE', dueDateISO: null,
      });
      getAccessibleProjectIdsMock.mockResolvedValue(null);

      await caller(ctx).parseTask({ text: 'create task', workspaceId: 'ws-1' });

      // project.findMany called with no id filter
      const projectCall = ctx.db.project.findMany.mock.calls[0][0];
      expect(projectCall.where).toEqual({ workspaceId: 'ws-1' });
    });

    it('restricts project list when guest with allowedProjectIds', async () => {
      mockParseTask.mockResolvedValue({
        title: 't', description: null, assigneeName: null,
        projectName: null, labelNames: [], status: 'TODO', priority: 'NONE', dueDateISO: null,
      });
      getAccessibleProjectIdsMock.mockResolvedValue(['proj-1']);

      await caller(ctx).parseTask({ text: 'create task', workspaceId: 'ws-1' });

      const projectCall = ctx.db.project.findMany.mock.calls[0][0];
      expect(projectCall.where).toEqual({ workspaceId: 'ws-1', id: { in: ['proj-1'] } });
    });
  });
});
