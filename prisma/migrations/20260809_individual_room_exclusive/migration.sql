-- Jedna sala = jeden trening indywidualny naraz.
--
-- Klub ma dwie sale (Mikołów, Tychy) i sześciu trenerów, którzy potrafią mieć
-- te same okna dostępności. Bez tego ograniczenia dwóch klientów umawiało się
-- na 17:00 w Mikołowie u dwóch różnych trenerów i obaj przychodzili na jedną
-- matę. Sprawdzanie w aplikacji (lib/domain/availability.ts) obsługuje ścieżkę
-- normalną; indeks jest zabezpieczeniem na wyścig dwóch równoczesnych zapisów.
--
-- Prisma nie modeluje indeksów częściowych - dlatego surowy SQL, celowo.

-- Stary indeks trenera nie wyłączał zajęć ODWOŁANYCH: po spóźnionym odwołaniu
-- sesja zostaje w bazie ze statusem CANCELLED i blokowała tę godzinę na
-- zawsze. Aplikacja proponowała termin, a baza go odrzucała komunikatem
-- "ktoś właśnie zajął ten termin". Odtwarzamy indeks z warunkiem statusu.
DROP INDEX IF EXISTS "Session_individual_slot_key";

CREATE UNIQUE INDEX "Session_individual_slot_key"
    ON "Session"("trainerId", "startsAt")
    WHERE "kind" = 'INDIVIDUAL' AND "status" <> 'CANCELLED';

-- Nowa reguła: ta sama godzina w tej samej sali tylko raz. Dotyczy wyłącznie
-- treningów indywidualnych - zajęcia grupowe mogą mieć w grafiku wspólne
-- godziny (np. dwie grupy na dwóch matach) i tego nie ruszamy. Kolizję
-- "grupa kontra indywidualny" łapie warstwa aplikacji.
CREATE UNIQUE INDEX "Session_individual_room_key"
    ON "Session"("locationId", "startsAt")
    WHERE "kind" = 'INDIVIDUAL' AND "status" <> 'CANCELLED';
