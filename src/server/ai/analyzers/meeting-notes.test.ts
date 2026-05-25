import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, anthropicCreate } = vi.hoisted(() => {
  function model() {
    return {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    };
  }
  return {
    mockDb: { document: model(), workspaceMember: model() },
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

import { extractMeetingActions } from './meeting-notes';
import { createInsight } from '@/server/ai/agent-engine';

const longContent = 'a'.repeat(100);

describe('extractMeetingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.workspaceMember.findMany.mockResolvedValue([]);
  });

  it('returns 0 when document not found', async () => {
    mockDb.document.findUnique.mockResolvedValue(null);
    expect(await extractMeetingActions('doc-x', 'ws-1')).toBe(0);
  });

  it('returns 0 if docType is not MEETING_NOTES', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 't', content: longContent, docType: 'RUNBOOK', authorId: 'u1',
    });
    expect(await extractMeetingActions('d1', 'ws-1')).toBe(0);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns 0 if content is too short', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 't', content: 'short', docType: 'MEETING_NOTES', authorId: 'u1',
    });
    expect(await extractMeetingActions('d1', 'ws-1')).toBe(0);
  });

  it('calls Claude with member names and content', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 'Q1 Sync', content: longContent,
      docType: 'MEETING_NOTES', authorId: 'u1',
    });
    mockDb.workspaceMember.findMany.mockResolvedValue([
      { user: { id: 'u1', name: 'Alice' } },
      { user: { id: 'u2', name: 'Bob' } },
    ]);
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"actionItems":[],"summary":""}' }],
    });

    await extractMeetingActions('d1', 'ws-1');

    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('Alice, Bob'),
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Q1 Sync'),
        }),
      ]),
    }));
  });

  it('returns 0 when no action items extracted', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 'M', content: longContent, docType: 'MEETING_NOTES', authorId: 'u1',
    });
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"actionItems":[],"summary":"nothing"}' }],
    });

    expect(await extractMeetingActions('d1', 'ws-1')).toBe(0);
    expect(createInsight).not.toHaveBeenCalled();
  });

  it('creates insight with extracted action items', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 'Sprint Planning', content: longContent,
      docType: 'MEETING_NOTES', authorId: 'u1',
    });
    anthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          actionItems: [
            { title: 'Write spec for API', assigneeName: 'Bob', priority: 'HIGH' },
            { title: 'Review PR #42', assigneeName: 'Alice', priority: 'MEDIUM' },
          ],
          summary: 'Discussed Q1 roadmap',
        }),
      }],
    });

    const count = await extractMeetingActions('d1', 'ws-1');

    expect(count).toBe(1);
    expect(createInsight).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MEETING_ACTION_ITEMS',
      targetUserId: 'u1',
      documentId: 'd1',
      title: expect.stringContaining('2 action items'),
      body: expect.stringContaining('Write spec for API'),
      proposedAction: expect.objectContaining({
        type: 'create_tasks_from_meeting',
        documentId: 'd1',
        actionItems: expect.any(Array),
      }),
    }));
  });

  it('returns 0 when Claude response is malformed', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 'M', content: longContent, docType: 'MEETING_NOTES', authorId: 'u1',
    });
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    expect(await extractMeetingActions('d1', 'ws-1')).toBe(0);
  });
});
