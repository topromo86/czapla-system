-- Zastępstwo wymaga potwierdzenia przez zastępcę.
CREATE TYPE "SubstituteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

ALTER TABLE "Session"
  ADD COLUMN "substituteStatus"        "SubstituteStatus",
  ADD COLUMN "substituteRequestedAt"   TIMESTAMPTZ,
  ADD COLUMN "substituteRespondedAt"   TIMESTAMPTZ,
  ADD COLUMN "substituteRequestedById" TEXT,
  ADD COLUMN "substituteByAdmin"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "substituteDeclineReason" TEXT;

-- Zastępstwa sprzed tej zmiany były natychmiastowe - ktoś je już realnie
-- prowadzi. Oznaczamy je jako ACCEPTED, bo cofnięcie ich do PENDING
-- odebrałoby tym zajęciom prowadzącego i wypaczyło naliczone wynagrodzenia.
UPDATE "Session"
SET "substituteStatus" = 'ACCEPTED',
    "substituteRespondedAt" = "updatedAt"
WHERE "substituteTrainerId" IS NOT NULL;

-- Admin filtruje po statusie na ekranie zastępstw.
CREATE INDEX "Session_substituteStatus_startsAt_idx"
  ON "Session" ("substituteStatus", "startsAt");

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SUBSTITUTE_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE 'SUBSTITUTE_ACCEPTED';
ALTER TYPE "ActivityAction" ADD VALUE 'SUBSTITUTE_DECLINED';
ALTER TYPE "ActivityAction" ADD VALUE 'SUBSTITUTE_CANCELLED';
