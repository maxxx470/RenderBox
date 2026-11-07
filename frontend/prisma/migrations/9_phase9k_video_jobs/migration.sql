-- Video generation (2026-11-07, owner's « Cahier de référence — AI VIDEO
-- GENERATION »). ADDITIVE: one new table, two indexes and one unique. It
-- drops nothing and alters no existing column, so it is safe to apply to a
-- running production base.

CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceNodeId" TEXT,
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "camera" TEXT NOT NULL,
    "environment" JSONB NOT NULL,
    "intensity" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL,
    "audio" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerTaskId" TEXT,
    "creditsCharged" INTEGER NOT NULL,
    "providerCredits" DOUBLE PRECISION,
    "refundedAt" TIMESTAMP(3),
    "blobUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "failCode" TEXT,
    "failMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- One Kie task can back exactly one job: a replayed callback must find the
-- row it already filled, never create a second one.
CREATE UNIQUE INDEX "VideoJob_providerTaskId_key" ON "VideoJob"("providerTaskId");

CREATE INDEX "VideoJob_userId_createdAt_idx" ON "VideoJob"("userId", "createdAt");

-- The sweeper reads this one: jobs left RUNNING past their deadline.
CREATE INDEX "VideoJob_status_createdAt_idx" ON "VideoJob"("status", "createdAt");

ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: deleting the source image must not erase the clip
-- made from it, nor the record of what it cost.
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_sourceNodeId_fkey"
    FOREIGN KEY ("sourceNodeId") REFERENCES "RenderNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
