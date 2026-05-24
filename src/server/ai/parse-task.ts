import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export interface WorkspaceContext {
  members: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string }>;
  currentDate: string; // YYYY-MM-DD
}

export interface ParsedTask {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  projectName?: string;
  assigneeName?: string;
  dueDateISO?: string;
  labelNames?: string[];
}

const createTaskTool: Anthropic.Messages.Tool = {
  name: 'create_task',
  description: 'Extract structured task fields from a natural language description',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A concise, actionable task title derived from the input',
      },
      description: {
        type: 'string',
        description: 'Optional longer description if the input contains extra detail beyond the title',
      },
      status: {
        type: 'string',
        enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'],
        description: 'Task status. Default to TODO if not specified.',
      },
      priority: {
        type: 'string',
        enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'],
        description:
          "Task priority. Map 'critical'/'P0' to URGENT, 'high'/'P1' to HIGH, 'medium'/'P2' to MEDIUM, 'low'/'P3' to LOW. Default to NONE if not specified.",
      },
      projectName: {
        type: 'string',
        description: 'The project name if mentioned. Must match one of the provided project names.',
      },
      assigneeName: {
        type: 'string',
        description: 'The assignee name if mentioned. Must match one of the provided team member names.',
      },
      dueDateISO: {
        type: 'string',
        description:
          "ISO 8601 date string (YYYY-MM-DD). Resolve relative dates like 'Friday', 'tomorrow', 'next week' relative to today's date provided in the system prompt.",
      },
      labelNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Label names if mentioned or implied (e.g. 'bug', 'feature', 'design'). Must match the provided label names.",
      },
    },
    required: ['title'],
  },
};

function buildSystemPrompt(context: WorkspaceContext): string {
  const memberNames = context.members.map((m) => m.name).join(', ');
  const projectNames = context.projects.map((p) => p.name).join(', ');
  const labelNames = context.labels.map((l) => l.name).join(', ');

  return `You are a task parsing assistant for a project management tool. Extract structured task fields from the user's natural language input.

Today's date: ${context.currentDate} (use this to resolve relative dates like "Friday", "tomorrow", "next week", "end of month").

Workspace context:
- Team members: ${memberNames || 'none'}
- Projects: ${projectNames || 'none'}
- Labels: ${labelNames || 'none'}

Rules:
- Always generate a concise, actionable title.
- If the input mentions a type like "bug", "feature", "design task", set appropriate labels if they exist in the workspace.
- Map "urgent"/"critical"/"P0" to URGENT, "high"/"P1" to HIGH, "medium"/"P2" to MEDIUM, "low"/"P3" to LOW.
- Match member names fuzzily — first name alone is sufficient (e.g., "Sarah" matches "Sarah Chen").
- Match project names fuzzily — partial matches are acceptable.
- For "Friday" with no qualifier, use the NEXT upcoming Friday from today's date.
- For "next week", use the following Monday.
- If a field is not mentioned or implied, omit it from the tool call.`;
}

export async function parseTaskFromNaturalLanguage(
  text: string,
  context: WorkspaceContext
): Promise<ParsedTask> {
  const response = await anthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(context),
    tools: [createTaskTool],
    tool_choice: { type: 'tool', name: 'create_task' },
    messages: [{ role: 'user', content: text }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolBlock) {
    throw new Error('No tool use block in Claude response');
  }

  return toolBlock.input as ParsedTask;
}

// --- Auto-Triage ---

export interface TriageSuggestion {
  priority?: string;
  labelNames?: string[];
  assigneeName?: string;
  reasoning?: string;
}

const triageTaskTool: Anthropic.Messages.Tool = {
  name: 'triage_task',
  description: 'Suggest priority, labels, and assignee for a task based on its title',
  input_schema: {
    type: 'object' as const,
    properties: {
      priority: {
        type: 'string',
        enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'],
        description:
          "Suggested priority. Bugs and outages tend to be HIGH/URGENT. Features are typically MEDIUM. Docs/chores are LOW. Only suggest if you have reasonable confidence.",
      },
      labelNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Suggested labels based on the task type (e.g. bug, feature, design, infra). Must match provided label names.',
      },
      assigneeName: {
        type: 'string',
        description:
          'Suggested assignee based on the task domain and team member roles/expertise. Only suggest if the task clearly maps to a specific person.',
      },
      reasoning: {
        type: 'string',
        description: 'Brief one-sentence explanation of why these suggestions were made.',
      },
    },
    required: [],
  },
};

function buildTriagePrompt(context: WorkspaceContext): string {
  const memberNames = context.members.map((m) => m.name).join(', ');
  const labelNames = context.labels.map((l) => l.name).join(', ');

  return `You are a task triage assistant. Given a task title, suggest appropriate priority, labels, and assignee.

Workspace context:
- Team members: ${memberNames || 'none'}
- Labels: ${labelNames || 'none'}

Rules:
- Suggest priority based on urgency signals: "bug"/"fix"/"broken"/"crash" → HIGH or URGENT. "feature"/"add"/"implement" → MEDIUM. "docs"/"readme"/"typo"/"chore" → LOW.
- Suggest labels that match the task type. Only use labels from the workspace list.
- Only suggest an assignee if the task domain clearly maps to someone. Do not guess randomly.
- If you're not confident about a field, omit it entirely.
- Keep reasoning to one short sentence.`;
}

export async function triageTask(
  title: string,
  context: WorkspaceContext
): Promise<TriageSuggestion> {
  const response = await anthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: buildTriagePrompt(context),
    tools: [triageTaskTool],
    tool_choice: { type: 'tool', name: 'triage_task' },
    messages: [{ role: 'user', content: `Task title: "${title}"` }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolBlock) {
    throw new Error('No tool use block in Claude response');
  }

  return toolBlock.input as TriageSuggestion;
}

// --- Fuzzy matching helpers ---

export function fuzzyMatchMember(
  name: string | undefined,
  members: Array<{ id: string; name: string }>
): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Exact match
  const exact = members.find((m) => m.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // First name match
  const firstName = members.find(
    (m) => m.name.toLowerCase().split(' ')[0] === lower
  );
  if (firstName) return firstName.id;

  // Starts with
  const startsWith = members.find(
    (m) => m.name.toLowerCase().startsWith(lower)
  );
  if (startsWith) return startsWith.id;

  // Contains
  const contains = members.find(
    (m) => m.name.toLowerCase().includes(lower)
  );
  if (contains) return contains.id;

  return null;
}

export function fuzzyMatchProject(
  name: string | undefined,
  projects: Array<{ id: string; name: string }>
): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  const exact = projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact.id;

  const startsWith = projects.find(
    (p) => p.name.toLowerCase().startsWith(lower)
  );
  if (startsWith) return startsWith.id;

  const contains = projects.find(
    (p) => p.name.toLowerCase().includes(lower)
  );
  if (contains) return contains.id;

  return null;
}

export function fuzzyMatchLabels(
  names: string[] | undefined,
  labels: Array<{ id: string; name: string }>
): string[] {
  if (!names || names.length === 0) return [];

  return names
    .map((name) => {
      const lower = name.toLowerCase().trim();
      const match =
        labels.find((l) => l.name.toLowerCase() === lower) ||
        labels.find((l) => l.name.toLowerCase().startsWith(lower)) ||
        labels.find((l) => l.name.toLowerCase().includes(lower));
      return match?.id;
    })
    .filter((id): id is string => id !== undefined);
}
