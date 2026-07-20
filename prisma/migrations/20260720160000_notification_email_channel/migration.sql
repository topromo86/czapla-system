-- Kanał e-mail w preferencjach powiadomień.
--
-- Domyślnie false, także dla istniejących wierszy: skrzynka klienta to nie
-- nasza tablica ogłoszeń. Kto chce maili, włącza je sam.
ALTER TABLE "NotificationPreference"
  ADD COLUMN "email" BOOLEAN NOT NULL DEFAULT false;
