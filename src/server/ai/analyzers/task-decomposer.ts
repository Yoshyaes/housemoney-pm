import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';
import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function suggestDecomposition(
  taskId: string,
  workspaceId: string
): Promise<number> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      identifier: true,
      title: true,
      description: true,
      createdById: true,
      subtasks: { select: { id: true } },
    },
  });

  if (!task || !task.description) return 0;
  if (task.subtasks.length > 0) return 0; // Already has subtasks

  const response = await anthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `You are a project management assistant. Given a task with a long description, suggest breaking it into smaller subtasks. Return a JSON object with: { "subtasks": [{ "title": "...", "description": "..." }], "reasoning": "..." }. Create 2-6 subtasks that are concrete and actionable. Each subtask title should be concise (under 80 chars).`,
    messages: [
      {
        role: 'user',
        content: `Task: "${task.title}"\n\nDescription:\n${task.description}`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  let subtasks: Array<{ title: string; description?: string }> = [];
  let reasoning = '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      subtasks = parsed.subtasks || [];
      reasoning = parsed.reasoning || '';
    }
  } catch {
    return 0;
  }

  if (subtasks.length === 0) return 0;

  const subtaskList = subtasks
    .map((s, i) => `${i + 1}. **${s.title}**${s.description ? `\n   ${s.description}` : ''}`)
    .join('\n');

  const id = await createInsight({
    workspaceId,
    type: 'DECOMPOSITION_SUGGESTED',
    targetUserId: task.createdById,
    taskId: task.id,
    title: `Consider breaking ${task.identifier} into ${subtasks.length} subtasks`,
    body: `**${task.identifier}** "${task.title}" has a detailed description that could be broken into smaller, actionable subtasks:\n\n${subtaskList}\n\n${reasoning ? `**Why:** ${reasoning}` : ''}`,
    confidence: 0.7,
    proposedAction: {
      type: 'create_subtasks',
      parentTaskId: task.id,
      subtasks,
    },
  });

  return id ? 1 : 0;
}
