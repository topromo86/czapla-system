-- Wymuszenie zmiany hasła przy pierwszym logowaniu.
--
-- Hasła kadry nadaje klub skryptem i podaje je osobiście. Dopóki trener ich nie
-- zmieni, hasło zna dwoje ludzi - czyli nie jest hasłem. Flaga gaśnie w chwili,
-- gdy właściciel konta ustawi własne.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
