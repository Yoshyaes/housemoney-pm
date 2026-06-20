import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, anthropicCreate } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    };
  }
  return {
    mockDb: { workspaceMember: model(), task: model(), activity: model() },
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

import { generateDailyDigest } from './daily-digest';
import { createInsight } from '@/server/ai/agent-engine';

describe('generateDailyDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.workspaceMember.findMany.mockResolvedValue([]);
    mockDb.activity.findMany.mockResolvedValue([]);
    mockDb.task.findMany.mockResolvedValue([]);
  });

  it('returns 0 when there are no members', async () => {
    expect(await generateDailyDigest('ws-1')).toBe(0);
  });

  it('skips digest for members with no activity', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
    ]);
    // All findMany calls return empty
    expect(await generateDailyDigest('ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('generates digest when member has new assignments', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
    ]);
    // changed tasks (activity.findMany call 1)
    mockDb.activity.findMany
      .mockResolvedValueOnce([]) // changedTasks
      .mockResolvedValueOnce([]); // resolvedBlockers
    // new assignments
    mockDb.task.findMany
      .mockResolvedValueOnce([{ identifier: 'HM-1', title: 'New task', priority: 'HIGH' }])
      .mockResolvedValueOnce([]) // upcomingDue
      .mockResolvedValueOnce([]); // tasks for blockers subquery

    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '# Focus today\nWork on HM-1' }],
    });

    const count = await generateDailyDigest('ws-1');

    expect(count).toBe(1);
    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Alice'),
        }),
      ]),
    }));
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DAILY_DIGEST',
      targetUserId: 'u1',
      title: expect.stringContaining('Daily digest'),
      body: '# Focus today\nWork on HM-1',
      confidence: 1.0,
      digestId: expect.stringContaining('digest-u1-'),
    }));
  });

  it('uses fallback text when Claude returns no text block', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
    ]);
    mockDb.activity.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockDb.task.findMany
      .mockResolvedValueOnce([{ identifier: 'HM-1', title: 'T', priority: 'LOW' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    anthropicCreate.mockResolvedValue({ content: [{ type: 'tool_use' }] });

    await generateDailyDigest('ws-1');

    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      body: 'No updates today.',
    }));
  });

  it('handles multiple members and skips those with nothing', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
      { userId: 'u2', user: { id: 'u2', name: 'Bob' } },
    ]);
    // For Alice: empty changedTasks, then has new assignment
    // For Bob: empty everything
    let activityCall = 0;
    mockDb.activity.findMany.mockImplementation(async () => {
      activityCall++;
      return [];
    });
    let taskCall = 0;
    mockDb.task.findMany.mockImplementation(async () => {
      taskCall++;
      // 1st call (Alice newAssignments): non-empty
      // 2nd call (Alice upcomingDue): empty
      // 3rd call (Alice blockers subquery): empty
      // 4th call (Bob newAssignments): empty
      // 5th call (Bob upcomingDue): empty
      if (taskCall === 1) {
        return [{ identifier: 'HM-1', title: 'T', priority: 'HIGH' }];
      }
      return [];
    });

    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Digest for Alice' }],
    });

    const count = await generateDailyDigest('ws-1');

    // Only Alice gets a digest
    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledTimes(1);
  });

  it('returns 0 for digests that createInsight rejected (rate limit)', async () => {
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
    ]);
    mockDb.activity.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockDb.task.findMany
      .mockResolvedValueOnce([{ identifier: 'HM-1', title: 'T', priority: 'LOW' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'digest' }],
    });
    vi.mocked(createInsight).mockResolvedValue(''); // limit hit

    expect(await generateDailyDigest('ws-1')).toBe(0);
  });
});
