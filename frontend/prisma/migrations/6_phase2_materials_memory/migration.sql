-- Phase 2 — materials memory: confidence becomes an integer 0-100, default
-- source flips to "auto" (manual edits set it explicitly), and one row per
-- (projectId, face) is enforced so the merge logic has a natural upsert
-- target. Safe: no real Material rows exist yet (Phase 1 shipped with the
-- table unused in production).
DROP INDEX "Material_projectId_face_idx";

ALTER TABLE "Material" ALTER COLUMN "source" SET DEFAULT 'auto';
ALTER TABLE "Material" ALTER COLUMN "confidence" TYPE INTEGER USING ROUND("confidence")::INTEGER;

CREATE UNIQUE INDEX "Material_projectId_face_key" ON "Material"("projectId", "face");
