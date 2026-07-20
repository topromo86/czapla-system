-- Okno bezkosztowego odwołania przenosi się z kodu do ustawień klubu.
-- Domyślnie 24h, zgodnie z decyzją właściciela - poprzednie 4h było stałą
-- w lib/domain/booking.ts.
ALTER TABLE "ClubSettings"
  ADD COLUMN "freeCancellationHours" INTEGER NOT NULL DEFAULT 24;
