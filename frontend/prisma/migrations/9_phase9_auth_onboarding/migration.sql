-- Phase 9 (2026-10-13): email + password sign-in, lockout, onboarding.
-- Additive: new nullable columns or columns with a default. Nothing is
-- dropped, renamed or rewritten.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "phone" TEXT,
ADD COLUMN "profession" TEXT,
ADD COLUMN "company" TEXT,
ADD COLUMN "teamSize" TEXT,
ADD COLUMN "projectTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mainUse" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "referralSource" TEXT,
ADD COLUMN "onboardedAt" TIMESTAMP(3);
