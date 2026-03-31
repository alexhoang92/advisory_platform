-- DropForeignKey
ALTER TABLE "credibility_scores" DROP CONSTRAINT IF EXISTS "credibility_scores_expert_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "credibility_scores";

-- CreateTable
CREATE TABLE "credibility_scores" (
    "id" TEXT NOT NULL,
    "expertUserId" TEXT NOT NULL,
    "displayState" TEXT NOT NULL,
    "platformWinRate30d" DOUBLE PRECISION,
    "platformAvgReturn30d" DOUBLE PRECISION,
    "platformCallCount" INTEGER NOT NULL DEFAULT 0,
    "platformScore30d" INTEGER,
    "platformCallsLast90d" INTEGER NOT NULL DEFAULT 0,
    "platformWinRate90d" DOUBLE PRECISION,
    "platformAvgReturn90d" DOUBLE PRECISION,
    "platformScore90d" INTEGER,
    "platformRatingDist" JSONB,
    "socialWinRate30d" DOUBLE PRECISION,
    "socialAvgReturn30d" DOUBLE PRECISION,
    "socialCallCount" INTEGER NOT NULL DEFAULT 0,
    "socialScore30d" INTEGER,
    "socialCallsLast90d" INTEGER NOT NULL DEFAULT 0,
    "socialWinRate90d" DOUBLE PRECISION,
    "socialAvgReturn90d" DOUBLE PRECISION,
    "socialScore90d" INTEGER,
    "socialRatingDist" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowNote" TEXT,

    CONSTRAINT "credibility_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credibility_scores_expertUserId_key" ON "credibility_scores"("expertUserId");

-- AddForeignKey
ALTER TABLE "credibility_scores" ADD CONSTRAINT "credibility_scores_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
