-- Phase 8 (2026-10-13): renders become credits.
-- Additive: one new column with a default, one CHECK, one conversion of the
-- balances left. Nothing is dropped; "generationsUsedInPeriod" stays, unread.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "creditsBalance" INTEGER NOT NULL DEFAULT 0;

-- A debit is a conditional UPDATE (balance >= cost); this guards it.
ALTER TABLE "User" ADD CONSTRAINT "User_creditsBalance_nonnegative" CHECK ("creditsBalance" >= 0);

-- Each active plan keeps what it had left: the renders not yet used, at 50
-- credits a render (the old quotas were 30 / 100 / 300). A lapsed period is
-- left at 0: it would be cleared on the next visit anyway.
UPDATE "User"
SET "creditsBalance" = 50 * GREATEST(
  0,
  (CASE "currentTier"
     WHEN 'decouverte' THEN 30
     WHEN 'standard' THEN 100
     WHEN 'pro' THEN 300
     ELSE 0
   END) - "generationsUsedInPeriod"
)
WHERE "currentTier" IS NOT NULL
  AND "tierPeriodStart" IS NOT NULL
  AND "tierPeriodStart" > NOW() - INTERVAL '30 days';
