-- Phase 5 — advanced editing: add-element / targeted-retouch trace fields.
ALTER TABLE "RenderNode" ADD COLUMN "editType" TEXT;
ALTER TABLE "RenderNode" ADD COLUMN "editZone" JSONB;
