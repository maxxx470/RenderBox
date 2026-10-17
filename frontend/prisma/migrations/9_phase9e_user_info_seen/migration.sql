-- When the user last opened the in-app Info page (2026-10-17, owner: a badge
-- on « Info » when something new is published there, « lié au compte »).
-- NULL = never opened; the account's creation date stands in.
-- Additive: one nullable column, no data changed.
ALTER TABLE "User" ADD COLUMN "infoSeenAt" TIMESTAMP(3);
