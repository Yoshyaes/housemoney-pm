import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, anthropicCreate } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), count: vi.fn(),
    };
  }
  return {
    mockDb: { task: model(), $queryRaw: vi.fn() },
    anthropicCreate: vi.fn(),
  };
});

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/ai/agent-engine', () => ({
  createInsight: vi.fn(async () => 'insight-id'),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
  },
}));

import { detectDuplicates } from './duplicate-detector';
import { createInsight } from '@/server/ai/agent-engine';

describe('detectDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when task not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    expect(await detectDuplicates('task-x', 'ws-1')).toBe(0);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns 0 when no similar tasks found', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'New', description: null, createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([]);

    expect(await detectDuplicates('t1', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns 0 when candidates fall below 0.5 similarity threshold', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'New', description: null, createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([
      { id: 't2', identifier: 'HM-2', title: 'Other', description: null, similarity: 0.45 },
    ]);

    expect(await detectDuplicates('t1', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('calls Claude with new task and candidates', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Fix login bug',
      description: 'The login form breaks', createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([
      { id: 't2', identifier: 'HM-2', title: 'Fix login issue', description: null, similarity: 0.85 },
    ]);
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"duplicates":[]}' }],
    });

    await detectDuplicates('t1', 'ws-1');

    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.stringContaining('claude'),
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Fix login bug'),
        }),
      ]),
    }));
  });

  it('creates insight when Claude confirms duplicates', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Fix login',
      description: null, createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([
      { id: 't2', identifier: 'HM-2', title: 'Fix login issue', description: null, similarity: 0.9 },
    ]);
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"duplicates":[{"identifier":"HM-2","confidence":0.9,"reason":"Same login fix"}]}',
      }],
    });

    const count = await detectDuplicates('t1', 'ws-1');

    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DUPLICATE_DETECTED',
      targetUserId: 'user-1',
      taskId: 't1',
      confidence: 0.9,
      title: expect.stringContaining('HM-2'),
      proposedAction: expect.objectContaining({
        type: 'update_task',
        taskId: 't1',
        changes: { status: 'CANCELLED' },
      }),
    }));
  });

  it('returns 0 when Claude response is malformed JSON', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Fix', description: null, createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([
      { id: 't2', identifier: 'HM-2', title: 'Fix', description: null, similarity: 0.9 },
    ]);
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ not json at all' }],
    });

    expect(await detectDuplicates('t1', 'ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('skips duplicates that do not match any candidate identifier', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Fix', description: null, createdById: 'user-1',
    });
    mockDb.$queryRaw.mockResolvedValue([
      { id: 't2', identifier: 'HM-2', title: 'Fix login', description: null, similarity: 0.9 },
    ]);
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"duplicates":[{"identifier":"HM-99","confidence":0.9,"reason":"hallucination"}]}',
      }],
    });

    expect(await detectDuplicates('t1', 'ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });
});
