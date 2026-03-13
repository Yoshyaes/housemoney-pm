import { createMockPrisma, type MockPrisma } from './mock-prisma';
import { testUser } from './fixtures';

export interface TestContext {
  db: MockPrisma;
  user: typeof testUser;
  userId: string;
}

export function createTestContext(overrides?: Partial<TestContext>): TestContext {
  return {
    db: createMockPrisma(),
    user: testUser,
    userId: testUser.id,
    ...overrides,
  };
}
