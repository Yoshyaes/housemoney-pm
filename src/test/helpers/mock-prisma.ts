import { vi } from 'vitest';

function createModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
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
    task: createModelMock(),
    taskLabel: createModelMock(),
    label: createModelMock(),
    comment: createModelMock(),
    activity: createModelMock(),
    dependency: createModelMock(),
    view: createModelMock(),
    notification: createModelMock(),
    gitHubPR: createModelMock(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
