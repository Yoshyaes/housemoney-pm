import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function extractMeetingActions(
  documentId: string,
  workspaceId: string
): Promise<number> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      content: true,
      docType: true,
      authorId: true,
    },
  });

  if (!doc || doc.docType !== 'MEETING_NOTES') return 0;
  if (!doc.content || doc.content.length < 50) return 0;

  // Get workspace members for assignee matching
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true } } },
  });

  const memberNames = members.map((m) => m.user.name).join(', ');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `You are a meeting notes analyzer. Extract action items from meeting notes and return them as potential tasks. Return a JSON object: { "actionItems": [{ "title": "...", "assigneeName": "..." or null, "priority": "MEDIUM" }], "summary": "..." }.

Team members: ${memberNames}

Rules:
- Only extract clear action items, not discussion points
- Match assignee names fuzzily to the team member list
- Default priority to MEDIUM unless urgency is implied
- Keep titles concise and actionable (start with a verb)
- Return at most 8 action items`,
    messages: [
      {
        role: 'user',
        content: `Meeting: "${doc.title}"\n\nNotes:\n${doc.content.slice(0, 3000)}`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  let actionItems: Array<{ title: string; assigneeName?: string; priority?: string }> = [];
  let summary = '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      actionItems = parsed.actionItems || [];
      summary = parsed.summary || '';
    }
  } catch {
    return 0;
  }

  if (actionItems.length === 0) return 0;

  const itemList = actionItems
    .map((item, i) => {
      const assignee = item.assigneeName ? ` → ${item.assigneeName}` : '';
      return `${i + 1}. **${item.title}**${assignee}`;
    })
    .join('\n');

  const id = await createInsight({
    workspaceId,
    type: 'MEETING_ACTION_ITEMS',
    targetUserId: doc.authorId,
    documentId: doc.id,
    title: `${actionItems.length} action item${actionItems.length !== 1 ? 's' : ''} extracted from "${doc.title}"`,
    body: `${summary ? `${summary}\n\n` : ''}**Action items:**\n\n${itemList}\n\nAccept to create these as tasks in your workspace.`,
    confidence: 0.75,
    proposedAction: {
      type: 'create_tasks_from_meeting',
      documentId: doc.id,
      actionItems,
    },
  });

  return id ? 1 : 0;
}
