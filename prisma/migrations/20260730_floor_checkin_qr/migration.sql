-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN     "floorMinMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "checkInToken" TEXT;

-- CreateTable
CREATE TABLE "FloorCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "enteredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT,

    CONSTRAINT "FloorCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FloorCheckIn_userId_enteredAt_idx" ON "FloorCheckIn"("userId", "enteredAt");

-- CreateIndex
CREATE INDEX "FloorCheckIn_locationId_enteredAt_idx" ON "FloorCheckIn"("locationId", "enteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_checkInToken_key" ON "User"("checkInToken");

-- AddForeignKey
ALTER TABLE "FloorCheckIn" ADD CONSTRAINT "FloorCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorCheckIn" ADD CONSTRAINT "FloorCheckIn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorCheckIn" ADD CONSTRAINT "FloorCheckIn_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

