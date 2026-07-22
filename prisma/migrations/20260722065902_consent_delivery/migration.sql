-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "consentsConfirmedByUserId" TEXT,
ADD COLUMN     "consentsDeliveredAt" TIMESTAMPTZ;

-- Backfill: istniejące kartoteki traktujemy jako "zgody dostarczone" (są już
-- w klubie), żeby nowa bramka nie zablokowała im zapisów. Tylko kartoteki
-- zakładane PO tej migracji startują jako niedostarczone (NULL) i podlegają
-- bramce pierwszych zajęć.
UPDATE "Member" SET "consentsDeliveredAt" = "createdAt" WHERE "consentsDeliveredAt" IS NULL;
