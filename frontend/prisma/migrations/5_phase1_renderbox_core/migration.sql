/*
  Warnings:

  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawalPinHash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrganizationMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Withdrawal` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordHash",
DROP COLUMN "withdrawalPinHash";

-- DropTable
DROP TABLE "Organization";

-- DropTable
DROP TABLE "OrganizationMember";

-- DropTable
DROP TABLE "Withdrawal";

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "face" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manuel',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "preset" TEXT,
    "prompt" TEXT NOT NULL,
    "materialsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RenderNode_projectId_createdAt_idx" ON "RenderNode"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "RenderNode_parentId_idx" ON "RenderNode"("parentId");

-- CreateIndex
CREATE INDEX "Material_projectId_face_idx" ON "Material"("projectId", "face");

-- CreateIndex
CREATE UNIQUE INDEX "Generation_nodeId_key" ON "Generation"("nodeId");

-- CreateIndex
CREATE INDEX "Generation_engine_createdAt_idx" ON "Generation"("engine", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderNode" ADD CONSTRAINT "RenderNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderNode" ADD CONSTRAINT "RenderNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RenderNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RenderNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
