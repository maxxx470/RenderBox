-- Phase 7 — materials per image (additive only).
--
-- Adds three tables (MaterialDetectionRun, MaterialDetection,
-- MaterialCorrection), two nullable columns on "Material" (attachedNodeId,
-- attachedAt) and one nullable column on "Generation" (promptMaterials).
-- Nothing existing is dropped, altered, renamed, updated or deleted, and no
-- old Material row is attached to an image: attaching one stays an explicit
-- user action (the future attach route checks project and owner).
--
-- Named 9_phase7_… so it sorts after every existing folder: Prisma applies
-- migrations in byte order of the folder name (0_init, 10_…, 1_…, 2026…,
-- 2_…, …, 9_phase5_…, 9_phase7_…), and this one needs "RenderNode" and
-- "Material" (5_phase1_renderbox_core, 6_phase2_materials_memory).
--
-- The statements down to the CHECK block were generated offline by
-- `prisma migrate diff --from-schema-datamodel <previous schema>
-- --to-schema-datamodel prisma/schema.prisma --script` and kept as is.

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "attachedAt" TIMESTAMP(3),
ADD COLUMN     "attachedNodeId" TEXT;

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "promptMaterials" JSONB;

-- CreateTable
CREATE TABLE "MaterialDetectionRun" (
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimToken" TEXT,
    "detector" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialDetectionRun_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "MaterialDetection" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "face" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCorrection" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "face" TEXT NOT NULL,
    "faceLabel" TEXT,
    "valeur" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'user',
    "legacyMaterialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialDetectionRun_status_updatedAt_idx" ON "MaterialDetectionRun"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialDetection_nodeId_face_key" ON "MaterialDetection"("nodeId", "face");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCorrection_legacyMaterialId_key" ON "MaterialCorrection"("legacyMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCorrection_nodeId_face_key" ON "MaterialCorrection"("nodeId", "face");

-- CreateIndex
CREATE INDEX "Material_attachedNodeId_idx" ON "Material"("attachedNodeId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_attachedNodeId_fkey" FOREIGN KEY ("attachedNodeId") REFERENCES "RenderNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDetectionRun" ADD CONSTRAINT "MaterialDetectionRun_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RenderNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDetection" ADD CONSTRAINT "MaterialDetection_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RenderNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCorrection" ADD CONSTRAINT "MaterialCorrection_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RenderNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCorrection" ADD CONSTRAINT "MaterialCorrection_legacyMaterialId_fkey" FOREIGN KEY ("legacyMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────────
-- CHECK constraints, written by hand: Prisma's schema cannot express them
-- (it neither creates nor drops them). They only touch the new tables,
-- which are empty when this runs.
-- ───────────────────────────────────────────────────────────────────────

-- The three states of a detection run; "succeeded" with zero
-- MaterialDetection rows means "looked at, nothing found".
ALTER TABLE "MaterialDetectionRun" ADD CONSTRAINT "MaterialDetectionRun_status_check" CHECK ("status" IN ('pending', 'succeeded', 'failed'));

-- Where a correction comes from: typed by the user, or an old project-level
-- Material row the user explicitly attached to this image.
ALTER TABLE "MaterialCorrection" ADD CONSTRAINT "MaterialCorrection_origin_check" CHECK ("origin" IN ('user', 'legacy_attach'));

-- Detector confidence is a 0-100 score.
ALTER TABLE "MaterialDetection" ADD CONSTRAINT "MaterialDetection_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100);

-- Faces are stored as the canonical key only (lowercase ASCII letters and
-- digits, single "_" between words, none at either end), so one face of one
-- image cannot exist twice under two spellings. COLLATE "C" keeps the
-- character ranges independent of the database locale. The 64-character
-- limit is enforced by the application's canonicalisation, not here.
ALTER TABLE "MaterialDetection" ADD CONSTRAINT "MaterialDetection_face_canonical_check" CHECK (("face" COLLATE "C") ~ '^[a-z0-9]+(_[a-z0-9]+)*$');

ALTER TABLE "MaterialCorrection" ADD CONSTRAINT "MaterialCorrection_face_canonical_check" CHECK (("face" COLLATE "C") ~ '^[a-z0-9]+(_[a-z0-9]+)*$');

-- No constraint on MaterialCorrection.valeur: NULL is an explicit removal.
