-- Rozróżnienie karnetów grupowych i indywidualnych.
--
-- Klub sprzedaje jedne i drugie, więc klient potrafi mieć oba naraz. Bez tej
-- flagi wejście schodziło z karnetu o najpóźniejszej dacie końca - trening
-- indywidualny zjadał wejście z karnetu grupowego i odwrotnie.
ALTER TABLE "Plan" ADD COLUMN "forIndividual" BOOLEAN NOT NULL DEFAULT false;
