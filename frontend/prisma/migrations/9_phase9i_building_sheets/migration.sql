-- 2026-10-22 (owner): the Claude analysis before every render with an
-- ambiance and every Améliorer. Additive: one new table, one new nullable
-- column.

-- 1. One sheet per building (or floor plan) of a project — what Claude read
-- of it, the sections written for its first render, the premium finishes of
-- Améliorer. Deleted with the project.
-- CreateTable
CREATE TABLE "BuildingSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "sections" JSONB,
    "premium" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildingSheet_projectId_kind_idx" ON "BuildingSheet"("projectId", "kind");

-- AddForeignKey
ALTER TABLE "BuildingSheet" ADD CONSTRAINT "BuildingSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. The analysis that preceded a render, kept with its generation (debug and
-- the real cost of each call). Null for every render made before.
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "analysis" JSONB;
