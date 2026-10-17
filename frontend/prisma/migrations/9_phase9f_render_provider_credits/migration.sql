-- What Kie charged for each image, in Kie credits (2026-10-17, owner: the API
-- usage in /admin, to see when the Kie balance runs low). NULL = not made
-- through Kie (uploads, the direct engines, every image before this).
-- Additive: one nullable column, no data changed.
ALTER TABLE "RenderNode" ADD COLUMN "providerCredits" DOUBLE PRECISION;
