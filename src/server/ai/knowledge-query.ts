import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';

const anthropic = new Anthropic();

export interface RelevantChunk {
  id: string;
  title: string;
  docType: string;
  tags: string[];
  updatedAt: Date;
  chunk: string;
  score: number;
}

export interface KnowledgeAnswer {
  answer: string;
  citations: Array<{
    docId: string;
    title: string;
    snippet: string;
    score: number;
  }>;
  hasResults: boolean;
}

const answerTool: Anthropic.Messages.Tool = {
  name: 'answer_knowledge_question',
  description: 'Answer a question based on the provided document excerpts',
  input_schema: {
    type: 'object' as const,
    properties: {
      answer: {
        type: 'string',
        description:
          'Markdown-formatted answer to the question. Reference sources as [Document N] inline.',
      },
      citedDocumentNumbers: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Array of document numbers (1-based) that were actually cited in the answer.',
      },
      hasAnswer: {
        type: 'boolean',
        description:
          'True if the documents contained enough information to answer the question.',
      },
    },
    required: ['answer', 'citedDocumentNumbers', 'hasAnswer'],
  },
};

export async function findRelevantChunks(
  query: string,
  workspaceId: string,
  db: PrismaClient,
  limit = 5,
  // When non-null, restricts results to documents in these projects (for guest scoping)
  allowedProjectIds: string[] | null = null
): Promise<RelevantChunk[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const useIlike = trimmed.length < 3;

  const projectFilter = allowedProjectIds !== null
    ? Prisma.sql`AND (d."projectId" IS NULL OR d."projectId" = ANY(${allowedProjectIds}))`
    : Prisma.sql``;

  const results = useIlike
    ? await db.$queryRaw<RelevantChunk[]>(
        Prisma.sql`
          SELECT d.id, d.title, d."docType", d.tags, d."updatedAt",
                 1.0::float8 AS score,
                 substring(d.content, 1, 600) AS chunk
          FROM "Document" d
          WHERE d."workspaceId" = ${workspaceId}
            AND (d.title ILIKE ${'%' + trimmed + '%'} OR d.content ILIKE ${'%' + trimmed + '%'})
            ${projectFilter}
          ORDER BY d."updatedAt" DESC
          LIMIT ${limit}
        `
      )
    : await db.$queryRaw<RelevantChunk[]>(
        Prisma.sql`
          SELECT d.id, d.title, d."docType", d.tags, d."updatedAt",
                 GREATEST(
                   similarity(d.title, ${trimmed}),
                   similarity(d.content, ${trimmed})
                 )::float8 AS score,
                 substring(d.content FROM
                   GREATEST(1, position(lower(${trimmed}) in lower(d.content)) - 200)
                   FOR 600
                 ) AS chunk
          FROM "Document" d
          WHERE d."workspaceId" = ${workspaceId}
            AND (d.title % ${trimmed} OR d.content % ${trimmed})
            ${projectFilter}
          ORDER BY score DESC
          LIMIT ${limit}
        `
      );

  return results;
}

function buildContext(chunks: RelevantChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const updatedAt = new Date(chunk.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const tags = chunk.tags.length > 0 ? ` | Tags: ${chunk.tags.join(', ')}` : '';
      return `[Document ${i + 1}] Title: "${chunk.title}"
Type: ${chunk.docType}${tags} | Last updated: ${updatedAt}

${chunk.chunk.trim()}

---`;
    })
    .join('\n\n');
}

export async function queryKnowledgeWithClaude(
  question: string,
  chunks: RelevantChunk[]
): Promise<KnowledgeAnswer> {
  const context = buildContext(chunks);

  const systemPrompt = `You are a knowledge assistant for a project management team.
You will be given excerpts from the team's internal documents (meeting notes, decision logs, retrospectives, experiment templates, runbooks, etc.) and a question from a team member.

Answer the question based ONLY on the provided document excerpts.
If the answer is not found in the documents, say so clearly — do not fabricate information.
Format your answer in markdown. When you cite a specific document, reference it as [Document N].
Keep your answer concise (under 300 words unless the question genuinely requires more detail).`;

  const userMessage = `Here are the relevant document excerpts from our knowledge base:

${context}

Question: ${question}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    tools: [answerTool],
    tool_choice: { type: 'tool', name: 'answer_knowledge_question' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolBlock) {
    throw new Error('No tool use block in Claude response');
  }

  const result = toolBlock.input as {
    answer: string;
    citedDocumentNumbers: number[];
    hasAnswer: boolean;
  };

  const citations = (result.citedDocumentNumbers || [])
    .filter((n) => n >= 1 && n <= chunks.length)
    .map((n) => {
      const chunk = chunks[n - 1];
      return {
        docId: chunk.id,
        title: chunk.title,
        snippet: chunk.chunk.slice(0, 200),
        score: chunk.score,
      };
    });

  return {
    answer: result.answer,
    citations,
    hasResults: result.hasAnswer,
  };
}
