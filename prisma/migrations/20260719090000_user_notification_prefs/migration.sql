-- AlterTable
ALTER TABLE "User" ADD COLUMN     "checkInNotifyPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "checkInNotifySms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pushSubscription" JSONB;
