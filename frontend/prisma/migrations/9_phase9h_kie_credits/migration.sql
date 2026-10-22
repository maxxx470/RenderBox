-- Phase 2 (2026-10-22, owner): the site's credits are Kie credits.
-- Additive: one new table, and one correction of a stored measure.

-- 1. The history of the Kie account's top-ups (« Stock Kie » in /admin).
-- CreateTable
CREATE TABLE "KieTopUp" (
    "id" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KieTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KieTopUp_createdAt_idx" ON "KieTopUp"("createdAt");

-- CreateIndex
CREATE INDEX "KieTopUp_adminId_idx" ON "KieTopUp"("adminId");

-- AddForeignKey
ALTER TABLE "KieTopUp" ADD CONSTRAINT "KieTopUp_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. RenderNode.providerCredits in Kie credits. Kie answered its
-- creditsConsumed in tenths of a credit until 2026-10-19 (60 for a 6-credit
-- image) and in credits from 2026-10-21 on: the images stored before
-- 2026-10-20 are divided by 10. Backup taken before: scripts/backups/
-- backup-full-avant-phase2-2026-10-22T18-25-14-776Z.json.
UPDATE "RenderNode"
SET "providerCredits" = "providerCredits" / 10
WHERE "providerCredits" IS NOT NULL
  AND "createdAt" < TIMESTAMP '2026-10-20 00:00:00';
