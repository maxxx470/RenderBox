-- Engine versions (2026-10-15): which version of the engine made an image
-- (lib/server/generation/engine-versions.ts), e.g. "visio-2-1".
-- Additive: one nullable column. Null for uploads, for every image made
-- before versions existed, and for an image the direct API made.

-- AlterTable
ALTER TABLE "RenderNode" ADD COLUMN "engineVersion" TEXT;
