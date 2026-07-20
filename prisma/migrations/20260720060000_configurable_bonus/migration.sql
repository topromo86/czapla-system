-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN "bonusThresholdScore" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "ClubSettings" ADD COLUMN "bonusAmountGross" INTEGER NOT NULL DEFAULT 0;
