ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "defaultEngine" TEXT;

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
