-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'ABSENCE_REPORTED';
ALTER TYPE "ActivityAction" ADD VALUE 'ENTRY_REFUNDED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "absenceReason" "AbsenceReason";
ALTER TABLE "Booking" ADD COLUMN "cancellationNote" TEXT;
ALTER TABLE "Booking" ADD COLUMN "absenceReportId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "chargedPassId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "entryRefundedAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "entryRefundedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_absenceReportId_fkey" FOREIGN KEY ("absenceReportId") REFERENCES "AbsenceReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_chargedPassId_fkey" FOREIGN KEY ("chargedPassId") REFERENCES "Pass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_entryRefundedByUserId_fkey" FOREIGN KEY ("entryRefundedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
