import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';
import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function detectDuplicates(
  taskId: string,
  workspaceId: string
): Promise<number> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, identifier: true, title: true, description: true, createdById: true },
  });

  if (!task) return 0;

  // Use raw SQL for trigram similarity search
  const similarTasks = await db.$queryRaw<
    Array<{ id: string; identifier: string; title: string; description: string | null; similarity: number }>
  >`
    SELECT id, identifier, title, description,
           similarity(title, ${task.title}) as similarity
    FROM "Task"
    WHERE "workspaceId" = ${workspaceId}
      AND id != ${taskId}
      AND status NOT IN ('CANCELLED')
      AND similarity(title, ${task.title}) > 0.4
    ORDER BY similarity DESC
    LIMIT 5
  `;

  if (similarTasks.length === 0) return 0;

  // Filter to high-similarity matches
  const candidates = similarTasks.filter((t) => t.similarity > 0.5);
  if (candidates.length === 0) return 0;

  // Use Claude Haiku to confirm if they're true duplicates
  const candidateList = candidates
    .map((t) => `- ${t.identifier}: "${t.title}" (similarity: ${(t.similarity * 100).toFixed(0)}%)`)
    .join('\n');

  const response = await anthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: 'You are a duplicate detection assistant. Determine if any of the candidate tasks are true duplicates of the new task. Only flag true duplicates (same work), not just similar topics. Respond with a JSON object: { "duplicates": [{ "identifier": "HM-X", "confidence": 0.8, "reason": "..." }] }. Return empty array if no true duplicates.',
    messages: [
      {
        role: 'user',
        content: `New task: "${task.title}"${task.description ? `\nDescription: ${task.description}` : ''}\n\nCandidate duplicates:\n${candidateList}`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  let duplicates: Array<{ identifier: string; confidence: number; reason: string }> = [];

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      duplicates = parsed.duplicates || [];
    }
  } catch {
    return 0;
  }

  let created = 0;

  for (const dup of duplicates) {
    const matchedTask = candidates.find((t) => t.identifier === dup.identifier);
    if (!matchedTask) continue;

    const id = await createInsight({
      workspaceId,
      type: 'DUPLICATE_DETECTED',
      targetUserId: task.createdById,
      taskId: task.id,
      title: `${task.identifier} may be a duplicate of ${matchedTask.identifier}`,
      body: `**${task.identifier}** "${task.title}" appears to be a duplicate of **${matchedTask.identifier}** "${matchedTask.title}".\n\n**Reason:** ${dup.reason}\n\nConsider closing this task if it's truly a duplicate.`,
      confidence: dup.confidence,
      proposedAction: {
        type: 'update_task',
        taskId: task.id,
        changes: { status: 'CANCELLED' },
      },
      previousState: { status: 'BACKLOG' },
    });

    if (id) created++;
  }

  return created;
}
