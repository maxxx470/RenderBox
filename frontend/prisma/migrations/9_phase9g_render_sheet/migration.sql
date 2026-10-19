-- The image's public code and its materials sheet (2026-10-19, owner: « chaque
-- image aura un code … la fiche de matériaux »). Both are nullable and every
-- image before this has neither: it gets a code when it is first shown, and a
-- sheet only when a render is made. Additive: two nullable columns and a
-- unique index (several NULLs are allowed), no data changed.
ALTER TABLE "RenderNode" ADD COLUMN "code" TEXT;
ALTER TABLE "RenderNode" ADD COLUMN "sheet" JSONB;
CREATE UNIQUE INDEX "RenderNode_code_key" ON "RenderNode"("code");
