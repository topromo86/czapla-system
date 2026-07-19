-- CreateEnum
CREATE TYPE "BookingHorizonMode" AS ENUM ('CURRENT_WEEK', 'FIXED_DAYS');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SETTINGS_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CATEGORY_CHANGED';

-- CreateTable
CREATE TABLE "ClubSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "bookingHorizonMode" "BookingHorizonMode" NOT NULL DEFAULT 'CURRENT_WEEK',
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ClubSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isIndividual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ClassCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassCategory_name_key" ON "ClassCategory"("name");

-- CreateIndex
CREATE INDEX "ClassCategory_active_sortOrder_idx" ON "ClassCategory"("active", "sortOrder");

-- Dokładnie jeden rodzaj może być tym "automatycznym dla treningów
-- indywidualnych" - inaczej nie wiadomo, który przypisać przy zapisie.
CREATE UNIQUE INDEX "ClassCategory_single_individual_key"
    ON "ClassCategory" (("isIndividual"))
    WHERE "isIndividual" = true;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "ClassTemplate" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClassCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTemplate" ADD CONSTRAINT "ClassTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClassCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ustawienia startowe i trzy rodzaje zajęć z ustaleń. Wstawiane migracją, a
-- nie seedem, żeby istniały też na produkcji zaraz po wdrożeniu.
INSERT INTO "ClubSettings" ("id", "bookingHorizonMode", "bookingHorizonDays", "updatedAt")
VALUES ('singleton', 'CURRENT_WEEK', 7, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ClassCategory" ("id", "name", "sortOrder", "isIndividual", "updatedAt") VALUES
    ('cat_boks_grupowy',        'Boks Grupowy',        10, false, CURRENT_TIMESTAMP),
    ('cat_boks_grupowy_junior', 'Boks Grupowy Junior', 20, false, CURRENT_TIMESTAMP),
    ('cat_treningi_personalne', 'Treningi Personalne', 30, true,  CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Istniejące zajęcia dostają rodzaj na podstawie tego, co już o nich wiemy:
-- treningi indywidualne -> Treningi Personalne, grupy dziecięce (z szablonu
-- isKids) -> Junior, reszta -> Boks Grupowy. Bez tego planner startowałby
-- z pustym filtrem rodzaju.
UPDATE "Session" SET "categoryId" = 'cat_treningi_personalne' WHERE "kind" = 'INDIVIDUAL';

UPDATE "ClassTemplate" SET "categoryId" = CASE WHEN "isKids" THEN 'cat_boks_grupowy_junior' ELSE 'cat_boks_grupowy' END;

UPDATE "Session" s
SET "categoryId" = t."categoryId"
FROM "ClassTemplate" t
WHERE s."templateId" = t."id" AND s."categoryId" IS NULL;

UPDATE "Session" SET "categoryId" = 'cat_boks_grupowy' WHERE "categoryId" IS NULL;
