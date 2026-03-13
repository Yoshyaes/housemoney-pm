-- Add workspaceId to Task (nullable first for backfill)
ALTER TABLE "Task" ADD COLUMN "workspaceId" TEXT;

-- Backfill workspaceId from project's workspace where task has a project
UPDATE "Task" t
SET "workspaceId" = p."workspaceId"
FROM "Project" p
WHERE t."projectId" = p."id";

-- For tasks without a project, use the first (only) workspace
UPDATE "Task"
SET "workspaceId" = (SELECT "id" FROM "Workspace" LIMIT 1)
WHERE "workspaceId" IS NULL;

-- Make workspaceId NOT NULL
ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AddForeignKey for Task.workspaceId
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable TaskCollaborator
CREATE TABLE "TaskCollaborator" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("taskId","userId")
);

-- AddForeignKey for TaskCollaborator
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
