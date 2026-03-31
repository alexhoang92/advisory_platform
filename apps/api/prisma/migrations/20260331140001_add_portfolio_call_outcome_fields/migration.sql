-- AlterTable
ALTER TABLE "portfolio_calls" ADD COLUMN "success30d" BOOLEAN,
ADD COLUMN "success90d" BOOLEAN,
ADD COLUMN "measuredAt" TIMESTAMP(3);
