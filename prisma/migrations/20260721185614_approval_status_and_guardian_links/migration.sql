-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "LinkRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "Session_substituteStatus_startsAt_idx";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMPTZ,
ADD COLUMN     "approvedByUserId" TEXT;

-- CreateTable
CREATE TABLE "GuardianLinkRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "childEmail" TEXT NOT NULL,
    "memberId" TEXT,
    "status" "LinkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,
    "resolvedByUserId" TEXT,

    CONSTRAINT "GuardianLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuardianLinkRequest_status_idx" ON "GuardianLinkRequest"("status");

-- CreateIndex
CREATE INDEX "GuardianLinkRequest_requesterUserId_idx" ON "GuardianLinkRequest"("requesterUserId");

-- CreateIndex
CREATE INDEX "Member_approvalStatus_idx" ON "Member"("approvalStatus");

-- AddForeignKey
ALTER TABLE "GuardianLinkRequest" ADD CONSTRAINT "GuardianLinkRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLinkRequest" ADD CONSTRAINT "GuardianLinkRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
