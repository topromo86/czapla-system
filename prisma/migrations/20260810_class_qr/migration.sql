-- Kody QR zajęć: jeden kod na jedne zajęcia, odbicie prowadzącego i
-- potwierdzenie listy obecności.
--
-- Kod jest losowany przy pierwszym pokazaniu na stacji i unikalny dla zajęć -
-- dzięki temu zdjęcie wczorajszego ekranu nikogo nie wpuści, a odbicie da się
-- powiązać z konkretnym treningiem, a nie tylko z wejściem do klubu.
ALTER TABLE "Session" ADD COLUMN "qrToken" TEXT;
ALTER TABLE "Session" ADD COLUMN "trainerCheckedInAt" TIMESTAMPTZ;
ALTER TABLE "Session" ADD COLUMN "trainerCheckedInUserId" TEXT;
ALTER TABLE "Session" ADD COLUMN "attendanceConfirmedAt" TIMESTAMPTZ;
ALTER TABLE "Session" ADD COLUMN "attendanceConfirmedCount" INTEGER;

CREATE UNIQUE INDEX "Session_qrToken_key" ON "Session"("qrToken");

-- Kiedy kod się pojawia i do kiedy trener ma się odbić - właściciel ustawia to
-- sam na ekranie ustawień, bo to reguła organizacyjna, nie decyzja techniczna.
ALTER TABLE "ClubSettings" ADD COLUMN "qrOpensMinutesBefore" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "ClubSettings" ADD COLUMN "trainerCheckInMinutesBefore" INTEGER NOT NULL DEFAULT 5;
