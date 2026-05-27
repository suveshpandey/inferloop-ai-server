-- AlterTable
ALTER TABLE "Iteration" ADD COLUMN     "testPassRate" INTEGER,
ALTER COLUMN "evaluatorOutput" DROP NOT NULL,
ALTER COLUMN "overallScore" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "finalEvaluation" JSONB;
