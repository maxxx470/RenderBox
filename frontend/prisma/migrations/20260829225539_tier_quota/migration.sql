-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentTier" TEXT,
ADD COLUMN     "generationsUsedInPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tierPeriodStart" TIMESTAMP(3);
