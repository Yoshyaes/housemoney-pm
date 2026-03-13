-- CreateEnum
CREATE TYPE "PRStatus" AS ENUM ('OPEN', 'MERGED', 'CLOSED');

-- CreateTable
CREATE TABLE "GitHubPR" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "PRStatus" NOT NULL DEFAULT 'OPEN',
    "authorLogin" TEXT NOT NULL,
    "authorAvatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubPR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubPR_githubId_key" ON "GitHubPR"("githubId");

-- CreateIndex
CREATE INDEX "GitHubPR_taskId_idx" ON "GitHubPR"("taskId");

-- AddForeignKey
ALTER TABLE "GitHubPR" ADD CONSTRAINT "GitHubPR_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
