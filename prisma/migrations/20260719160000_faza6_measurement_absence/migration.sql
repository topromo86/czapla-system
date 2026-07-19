-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM ('INJURY', 'OTHER');

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceReport" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" "AbsenceReason" NOT NULL,
    "note" TEXT,
    "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" DATE,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "AbsenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Measurement_memberId_recordedAt_idx" ON "Measurement"("memberId", "recordedAt");

-- CreateIndex
CREATE INDEX "AbsenceReport_memberId_resolvedAt_idx" ON "AbsenceReport"("memberId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceReport" ADD CONSTRAINT "AbsenceReport_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
