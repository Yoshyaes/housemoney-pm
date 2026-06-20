import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';

const { anthropicCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
  },
}));

import { findRelevantChunks, queryKnowledgeWithClaude } from './knowledge-query';

describe('findRelevantChunks', () => {
  let db: MockPrisma;

  beforeEach(() => {
    db = createMockPrisma();
    db.$queryRaw.mockResolvedValue([]);
    vi.clearAllMocks();
  });

  it('returns empty array for empty query', async () => {
    expect(await findRelevantChunks('', 'ws-1', db as never)).toEqual([]);
    expect(await findRelevantChunks('   ', 'ws-1', db as never)).toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses ILIKE path for short queries (<3 chars)', async () => {
    db.$queryRaw.mockResolvedValue([
      { id: 'd1', title: 'Doc', docType: 'NOTE', tags: [], updatedAt: new Date(), chunk: 'snippet', score: 1.0 },
    ]);

    const results = await findRelevantChunks('hi', 'ws-1', db as never);

    expect(results).toHaveLength(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    // Verify it used the ILIKE branch — inspect raw SQL strings
    const sqlArg = db.$queryRaw.mock.calls[0][0];
    const sqlText = JSON.stringify(sqlArg);
    expect(sqlText).toContain('ILIKE');
    expect(sqlText).not.toContain('similarity');
  });

  it('uses similarity path for longer queries (>=3 chars)', async () => {
    db.$queryRaw.mockResolvedValue([]);

    await findRelevantChunks('login', 'ws-1', db as never);

    const sqlArg = db.$queryRaw.mock.calls[0][0];
    const sqlText = JSON.stringify(sqlArg);
    expect(sqlText).toContain('similarity');
  });

  it('respects the limit parameter', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await findRelevantChunks('search query', 'ws-1', db as never, 10);

    const sqlArg = db.$queryRaw.mock.calls[0][0];
    // Prisma.sql wraps the limit value in `values`
    const values = sqlArg.values ?? sqlArg.strings;
    const sqlText = JSON.stringify(sqlArg);
    // The limit literal should appear among bind values
    expect(JSON.stringify(values)).toContain('10');
    expect(sqlText).toContain('LIMIT');
  });

  // CRITICAL: guest scoping test
  describe('guest scoping via allowedProjectIds', () => {
    it('does NOT include project filter when allowedProjectIds is null', async () => {
      db.$queryRaw.mockResolvedValue([]);
      await findRelevantChunks('search', 'ws-1', db as never, 5, null);

      const sqlArg = db.$queryRaw.mock.calls[0][0];
      const sqlText = JSON.stringify(sqlArg);
      // Project filter clause should be absent (template literal evaluates to empty Prisma.sql``)
      expect(sqlText).not.toContain('projectId');
    });

    it('INCLUDES project filter when allowedProjectIds is provided', async () => {
      db.$queryRaw.mockResolvedValue([]);
      const allowed = ['proj-1', 'proj-2'];
      await findRelevantChunks('search', 'ws-1', db as never, 5, allowed);

      const sqlArg = db.$queryRaw.mock.calls[0][0];
      const sqlText = JSON.stringify(sqlArg);
      // Project filter clause should be present
      expect(sqlText).toContain('projectId');
      // The allowed IDs should appear among bind values
      expect(JSON.stringify(sqlArg.values ?? [])).toContain('proj-1');
      expect(JSON.stringify(sqlArg.values ?? [])).toContain('proj-2');
    });

    it('empty allowedProjectIds array still adds the filter (guest with no projects)', async () => {
      db.$queryRaw.mockResolvedValue([]);
      await findRelevantChunks('search', 'ws-1', db as never, 5, []);

      const sqlArg = db.$queryRaw.mock.calls[0][0];
      const sqlText = JSON.stringify(sqlArg);
      // empty array is still non-null, so filter is included
      expect(sqlText).toContain('projectId');
    });

    it('guest scoping applies to both ILIKE and similarity paths', async () => {
      db.$queryRaw.mockResolvedValue([]);

      await findRelevantChunks('ab', 'ws-1', db as never, 5, ['proj-1']);
      const ilikeSql = JSON.stringify(db.$queryRaw.mock.calls[0][0]);
      expect(ilikeSql).toContain('ILIKE');
      expect(ilikeSql).toContain('projectId');

      db.$queryRaw.mockClear();

      await findRelevantChunks('longer', 'ws-1', db as never, 5, ['proj-1']);
      const simSql = JSON.stringify(db.$queryRaw.mock.calls[0][0]);
      expect(simSql).toContain('similarity');
      expect(simSql).toContain('projectId');
    });
  });

  it('trims whitespace from query', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await findRelevantChunks('  hello  ', 'ws-1', db as never);
    // The trimmed value is 6 chars (>=3) so uses similarity path
    const sqlArg = db.$queryRaw.mock.calls[0][0];
    expect(JSON.stringify(sqlArg)).toContain('similarity');
    // And value 'hello' (not '  hello  ') should be bound
    expect(JSON.stringify(sqlArg.values ?? [])).toContain('hello');
  });
});

describe('queryKnowledgeWithClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const chunks = [
    {
      id: 'd1', title: 'Auth spec', docType: 'SPEC', tags: ['auth'],
      updatedAt: new Date('2026-01-01'), chunk: 'Auth uses JWT...', score: 0.9,
    },
    {
      id: 'd2', title: 'Sessions doc', docType: 'NOTE', tags: [],
      updatedAt: new Date('2026-02-01'), chunk: 'Sessions are stored...', score: 0.7,
    },
  ];

  it('builds context block, calls Claude, returns answer with citations', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        input: {
          answer: 'JWT is used for auth [Document 1].',
          citedDocumentNumbers: [1],
          hasAnswer: true,
        },
      }],
    });

    const result = await queryKnowledgeWithClaude('How does auth work?', chunks);

    expect(result).toEqual({
      answer: 'JWT is used for auth [Document 1].',
      hasResults: true,
      citations: [
        expect.objectContaining({
          docId: 'd1',
          title: 'Auth spec',
          snippet: expect.stringContaining('Auth uses JWT'),
          score: 0.9,
        }),
      ],
    });

    // Verify the user message contains both context and question
    const callArgs = anthropicCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Auth spec');
    expect(callArgs.messages[0].content).toContain('Sessions doc');
    expect(callArgs.messages[0].content).toContain('How does auth work?');
    expect(callArgs.messages[0].content).toContain('[Document 1]');
    expect(callArgs.messages[0].content).toContain('[Document 2]');
  });

  it('throws if no tool_use block in response', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'just text' }],
    });

    await expect(queryKnowledgeWithClaude('q', chunks)).rejects.toThrow('No tool use block');
  });

  it('filters out invalid citation numbers (out of range)', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        input: {
          answer: 'a',
          citedDocumentNumbers: [0, 1, 99], // 0 and 99 are invalid
          hasAnswer: true,
        },
      }],
    });

    const result = await queryKnowledgeWithClaude('q', chunks);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].docId).toBe('d1');
  });

  it('returns empty citations when none cited', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        input: { answer: 'no answer', citedDocumentNumbers: [], hasAnswer: false },
      }],
    });

    const result = await queryKnowledgeWithClaude('q', chunks);
    expect(result.citations).toEqual([]);
    expect(result.hasResults).toBe(false);
  });

  it('handles undefined citedDocumentNumbers gracefully', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        input: { answer: 'a', hasAnswer: true },
      }],
    });

    const result = await queryKnowledgeWithClaude('q', chunks);
    expect(result.citations).toEqual([]);
  });
});
