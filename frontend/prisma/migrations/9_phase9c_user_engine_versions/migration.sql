-- The version chosen for each engine (2026-10-16, owner: « liée au compte »),
-- e.g. {"nanobanana":"visio-2-1","gpt_image":"pixel-2"}. It lived in the
-- browser's localStorage until now. NULL = the defaults (engine-versions.ts).
-- Additive: one nullable column, no data changed.
ALTER TABLE "User" ADD COLUMN "engineVersions" JSONB;
