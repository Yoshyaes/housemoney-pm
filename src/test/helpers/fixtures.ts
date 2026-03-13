export const testUser = {
  id: 'user-1',
  email: 'fred@test.com',
  name: 'Fred Thompson',
  avatarUrl: null,
  avatarColor: '#BA7517',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const testUser2 = {
  id: 'user-2',
  email: 'sarah@test.com',
  name: 'Sarah Chen',
  avatarUrl: null,
  avatarColor: '#185FA5',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const testUser3 = {
  id: 'user-3',
  email: 'marcus@test.com',
  name: 'Marcus Johnson',
  avatarUrl: null,
  avatarColor: '#0F6E56',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const testWorkspace = {
  id: 'ws-1',
  name: 'House Money',
  slug: 'house-money',
  taskCounter: 10,
  createdAt: new Date('2026-01-01'),
};

export const testProject = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  name: 'DocuForge API',
  description: 'API project',
  status: 'ACTIVE',
  color: '#1D9E75',
  targetDate: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const testLabels = [
  { id: 'label-1', workspaceId: 'ws-1', name: 'Feature', color: '#185FA5', bgColor: 'rgba(53,138,221,.12)', createdAt: new Date('2026-01-01') },
  { id: 'label-2', workspaceId: 'ws-1', name: 'Infra', color: '#0F6E56', bgColor: 'rgba(29,158,117,.12)', createdAt: new Date('2026-01-01') },
  { id: 'label-3', workspaceId: 'ws-1', name: 'Design', color: '#99355A', bgColor: 'rgba(212,83,126,.12)', createdAt: new Date('2026-01-01') },
];

export const testTask = {
  id: 'task-1',
  identifier: 'HM-10',
  title: 'Test task',
  description: 'A test task',
  status: 'TODO',
  priority: 'MEDIUM',
  projectId: 'proj-1',
  assigneeId: 'user-2',
  createdById: 'user-1',
  dueDate: new Date('2026-04-01'),
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  assignee: testUser2,
  createdBy: testUser,
  project: testProject,
  labels: [],
  blocking: [],
  blockedBy: [],
  githubPRs: [],
  comments: [],
  activities: [],
  _count: { comments: 0 },
};

export function createTask(overrides: Record<string, unknown> = {}) {
  return { ...testTask, ...overrides };
}
