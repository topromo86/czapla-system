-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('GROUP', 'INDIVIDUAL');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SESSION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'SESSION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'SESSION_CANCELLED';
ALTER TYPE "ActivityAction" ADD VALUE 'INDIVIDUAL_SESSION_BOOKED';
ALTER TYPE "ActivityAction" ADD VALUE 'AVAILABILITY_WINDOW_CHANGED';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "kind" "SessionKind" NOT NULL DEFAULT 'GROUP';

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityWindow_trainerId_active_idx" ON "AvailabilityWindow"("trainerId", "active");

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ten sam trener nie może mieć dwóch treningów indywidualnych o tej samej
-- godzinie. Indeks CZĘŚCIOWY (tylko INDIVIDUAL), bo istniejące zajęcia
-- grupowe nie mają takiego ograniczenia i nie chcemy ruszać danych z seeda.
-- Prisma nie modeluje indeksów częściowych - dlatego surowy SQL, celowo.
-- To jedyna twarda gwarancja przeciw wyścigowi dwóch klientów klikających
-- ten sam wolny slot; kod aplikacji łapie ten błąd i pokazuje "slot zajęty".
CREATE UNIQUE INDEX "Session_individual_slot_key"
    ON "Session"("trainerId", "startsAt")
    WHERE "kind" = 'INDIVIDUAL';
