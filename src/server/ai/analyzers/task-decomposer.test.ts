import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, anthropicCreate } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    };
  }
  return {
    mockDb: { task: model() },
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

import { suggestDecomposition } from './task-decomposer';
import { createInsight } from '@/server/ai/agent-engine';

describe('suggestDecomposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when task not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    expect(await suggestDecomposition('t-x', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns 0 when task has no description', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'T', description: null,
      createdById: 'u1', subtasks: [],
    });
    expect(await suggestDecomposition('t1', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns 0 when task already has subtasks', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'T', description: 'A long description here',
      createdById: 'u1', subtasks: [{ id: 'sub-1' }],
    });
    expect(await suggestDecomposition('t1', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('calls Claude with title and description', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Implement auth',
      description: 'Need to set up OAuth, password reset, sessions, MFA',
      createdById: 'u1', subtasks: [],
    });
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"subtasks":[],"reasoning":""}' }],
    });

    await suggestDecomposition('t1', 'ws-1');

    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Implement auth'),
        }),
      ]),
    }));
  });

  it('returns 0 when Claude returns no subtasks', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'T', description: 'long desc',
      createdById: 'u1', subtasks: [],
    });
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"subtasks":[],"reasoning":"no need"}' }],
    });
    expect(await suggestDecomposition('t1', 'ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('creates insight when Claude suggests subtasks', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'Implement auth',
      description: 'Long desc', createdById: 'u1', subtasks: [],
    });
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          subtasks: [
            { title: 'Set up OAuth', description: 'Google + GitHub providers' },
            { title: 'Add password reset', description: 'Email flow' },
          ],
          reasoning: 'Logical separation of concerns',
        }),
      }],
    });

    const count = await suggestDecomposition('t1', 'ws-1');

    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DECOMPOSITION_SUGGESTED',
      targetUserId: 'u1',
      taskId: 't1',
      title: expect.stringContaining('2 subtasks'),
      body: expect.stringContaining('Set up OAuth'),
      proposedAction: expect.objectContaining({
        type: 'create_subtasks',
        parentTaskId: 't1',
        subtasks: expect.any(Array),
      }),
    }));
  });

  it('returns 0 when Claude response is malformed', async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 't1', identifier: 'HM-1', title: 'T', description: 'long',
      createdById: 'u1', subtasks: [],
    });
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ broken json' }],
    });

    expect(await suggestDecomposition('t1', 'ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });
});
