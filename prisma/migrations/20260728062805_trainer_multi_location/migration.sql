-- CreateTable
CREATE TABLE "_TrainerLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TrainerLocations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TrainerLocations_B_index" ON "_TrainerLocations"("B");

-- AddForeignKey
ALTER TABLE "_TrainerLocations" ADD CONSTRAINT "_TrainerLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TrainerLocations" ADD CONSTRAINT "_TrainerLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: każdy istniejący trener zaczyna z jedną lokalizacją = jego dotychczasowa
-- lokalizacja domyślna (locationId). Dodatkowe lokalizacje dokłada admin.
INSERT INTO "_TrainerLocations" ("A", "B")
SELECT "locationId", "id" FROM "Trainer"
ON CONFLICT DO NOTHING;
