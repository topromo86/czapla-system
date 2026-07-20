-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('RECURRING_MONTHLY', 'ONE_OFF');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'TRAINER_RATE_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE 'COST_CHANGED';

-- CreateTable
CREATE TABLE "TrainerRate" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "amountGross" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountGross" INTEGER NOT NULL,
    "kind" "CostKind" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "note" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ClubCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerRate_trainerId_kind_validFrom_key" ON "TrainerRate"("trainerId", "kind", "validFrom");

-- CreateIndex
CREATE INDEX "TrainerRate_trainerId_kind_validFrom_idx" ON "TrainerRate"("trainerId", "kind", "validFrom");

-- CreateIndex
CREATE INDEX "ClubCost_kind_startsOn_idx" ON "ClubCost"("kind", "startsOn");

-- AddForeignKey
ALTER TABLE "TrainerRate" ADD CONSTRAINT "TrainerRate_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCost" ADD CONSTRAINT "ClubCost_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
