-- AlterTable
ALTER TABLE "User" ALTER COLUMN "username" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "finalCode" TEXT NOT NULL,
    "maxIterations" INTEGER NOT NULL,
    "iterationsRun" INTEGER NOT NULL,
    "terminationReason" TEXT NOT NULL,
    "finalScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Iteration" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "iterationIndex" INTEGER NOT NULL,
    "inputCode" TEXT NOT NULL,
    "analyzerOutput" JSONB NOT NULL,
    "criticOutput" JSONB NOT NULL,
    "improverOutput" JSONB NOT NULL,
    "evaluatorOutput" JSONB NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Iteration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_userId_createdAt_idx" ON "Run"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Iteration_runId_idx" ON "Iteration"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Iteration_runId_iterationIndex_key" ON "Iteration"("runId", "iterationIndex");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iteration" ADD CONSTRAINT "Iteration_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
