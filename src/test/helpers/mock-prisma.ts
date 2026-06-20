import { vi } from 'vitest';

function createModelMock() {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function createMockPrisma() {
  return {
    user: createModelMock(),
    workspace: createModelMock(),
    workspaceMember: createModelMock(),
    project: createModelMock(),
    projectMember: createModelMock(),
    task: createModelMock(),
    taskLabel: createModelMock(),
    taskCollaborator: createModelMock(),
    taskAttachment: createModelMock(),
    label: createModelMock(),
    comment: createModelMock(),
    activity: createModelMock(),
    dependency: createModelMock(),
    view: createModelMock(),
    notification: createModelMock(),
    gitHubPR: createModelMock(),
    document: createModelMock(),
    documentComment: createModelMock(),
    documentAttachment: createModelMock(),
    documentChunk: createModelMock(),
    decision: createModelMock(),
    decisionParticipant: createModelMock(),
    experiment: createModelMock(),
    experimentComment: createModelMock(),
    feedback: createModelMock(),
    feedbackComment: createModelMock(),
    section: createModelMock(),
    invitation: createModelMock(),
    auditLog: createModelMock(),
    agentSuggestion: createModelMock(),
    agentInsight: createModelMock(),
    agentConfig: createModelMock(),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
