-- Re-engagement e-mails (2026-10-31). Additive: two nullable columns on
-- "User" and one new table. Nothing existing is altered or dropped, so the
-- migration is safe to apply to the live Neon base while the app runs.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingUnsubscribedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailBouncedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ReengagementEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReengagementEmail_pkey" PRIMARY KEY ("id")
);

-- The idempotency guarantee: one relance of one kind per person, ever
-- (per paid period for the kinds that may come back).
CREATE UNIQUE INDEX IF NOT EXISTS "ReengagementEmail_dedupeKey_key"
    ON "ReengagementEmail"("dedupeKey");

CREATE INDEX IF NOT EXISTS "ReengagementEmail_userId_sentAt_idx"
    ON "ReengagementEmail"("userId", "sentAt");

ALTER TABLE "ReengagementEmail"
    ADD CONSTRAINT "ReengagementEmail_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
