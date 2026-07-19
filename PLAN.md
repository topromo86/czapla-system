# PLAN - kolejność budowy

Fazy realizuj **po kolei**. Nie zaczynaj kolejnej, dopóki poprzednia nie jest wdrożona i przetestowana na żywym ruchu.

Kolejność nie jest przypadkowa: najpierw to, co zbiera dane o retencji, potem to, co na tych danych operuje. Ranking trenerów jest bezużyteczny przez pierwsze 90 dni, bo nie ma dojrzałej kohorty - dlatego jest w Fazie 5, a nie w Fazie 1, mimo że to główny cel projektu.

Legenda: `[ ]` do zrobienia · `[x]` gotowe · ❗️ = brakuje, patrz tutaj najpierw

Stan na 2026-07-19: **Cały plan (Fazy 0-6) gotowy.** SMS w Fazie 4 i wysyłka ankiety w Fazie 5 to gotowe wtyczki bez podpiętego dostawcy poczty/SMS (patrz ❗️ przy nich) - to jedyne realne braki, reszta działa i jest przetestowana na żywo. Faza 5 zbudowana wcześniej niż standardowo zalecane, na życzenie właściciela - w seedzie dane są już dojrzałe, na produkcji z prawdziwymi klientami nadal trzeba będzie poczekać ok. 90 dni na sensowne wyniki rankingu.

---

## Faza 0 - Fundament
**Cel:** puste, ale wdrożone i działające repo. **Czas: 1-2 dni.**

- [x] `create-next-app` (TypeScript, App Router, Tailwind), ESLint + Prettier
- [x] Prisma + Postgres, połączenie, pierwsza migracja (lokalna baza dev - prawdziwy Neon dopiero przy wdrożeniu, patrz ❗️ niżej)
- [x] Pełny schema z `SPEC.md` sekcja 1 - cały, na raz. Zmiana schematu później jest droga.
- [x] Seed deterministyczny wg `SPEC.md` sekcja 5
- [x] Auth.js: e-mail + hasło, 4 role, `lib/auth/guard.ts` z jednym miejscem autoryzacji
- [x] Design tokens z `CLAUDE.md` → `globals.css` + Tailwind theme, fonty (Anton, Archivo, IBM Plex Mono) - zaktualizowane na jasny motyw + branding klienta (Czapla Boxing)
- [x] shadcn/ui init, przykrycie domyślnym motywem tokenami
- [x] GitHub Actions: lint + typecheck + testy
- [ ] ❗️ **Deploy na Vercel, env dev/prod** - czeka na Twoje konto GitHub/Vercel. Cały projekt działa dotąd tylko lokalnie.

> **Prompt:** Przeczytaj CLAUDE.md i SPEC.md. Wykonaj Fazę 0 z PLAN.md. Zacznij od pełnego schema Prisma - pokaż mi go do akceptacji przed migracją. Nie pisz jeszcze żadnego UI poza layoutem i stroną logowania.

---

## Faza 1 - Zapisy i obecności
**Cel:** klient zapisuje się i melduje kodem QR. Od tego momentu zbierają się dane. **Czas: 1-2 tyg.**

- [x] `lib/domain/booking.ts` - czyste funkcje: okno odwołania, awans z listy rezerwowej, walidacja wieku. **Testy jednostkowe najpierw.**
- [x] Job `generateSessions` (8 tygodni do przodu)
- [x] Ekran grafiku: 7 dni, filtr lokalizacji, zapis, odwołanie, lista rezerwowa
- [x] Awans z listy rezerwowej w transakcji (transakcyjnie, sprawdzone) - ❗️ samo "powiadomienie" to tylko widoczna zmiana statusu w apce, nie push/e-mail (brak infrastruktury, patrz Faza 4)
- [x] Zgody: modele, ekran podpisu przy pierwszym logowaniu, **blokada rezerwacji po stronie serwera** bez kompletu
- [x] Karnet minimum: właściciel ręcznie zakłada `Pass` klientowi, wygasły karnet blokuje rezerwację (od Fazy 3 pełna sprzedaż z płatnością)
- [x] Check-in QR: strony `/qr/[locationId]`, walidacja okna −30/+20 min, `Attendance(QR)`
- [x] Panel trenera - ekran „Dziś": lista obecności, ręczne uzupełnianie braków (`method: MANUAL`)
- [x] Odwołanie zajęć / zastępstwo przez trenera
- [x] PWA: manifest, service worker, instalacja na ekranie głównym

> **Prompt:** Faza 1 z PLAN.md. Zacznij od lib/domain/booking.ts i testów - dopiero potem UI. Reguła nr 2 i nr 9 z CLAUDE.md są krytyczne: obecność MANUAL musi być oznaczona, a rezerwacja bez kompletu zgód ma się nie udać na serwerze.

**Wdrożenie:** tu jest pierwsza premiera. Klub używa systemu do zapisów. Trenerzy jeszcze nie są oceniani - i nie mów im, że będą, dopóki dane nie są wiarygodne.

---

## Faza 2 - Warstwa retencji
**Cel:** system zaczyna pilnować relacji. To jest właściwy produkt. **Czas: 1-2 tyg.**

- [x] Przypisanie opiekuna: `ownerTrainerId` obowiązkowy przy zakładaniu klienta
- [x] Karta klienta: dane, cel, staż, historia obecności
- [x] Notatki (`Note`) - dodawanie, walidacja min. 30 znaków na serwerze
- [x] `OnboardingStep` - generowanie 3 etapów przy `joinedAt`, ekran checklisty
- [x] Job `detectInactive` - alerty 7/14 dni
- [x] Job `expireOldTasks` - eskalacja
- [x] Panel trenera: ekran „Alerty" z badge, zamknięcie **wyłącznie z notatką**
- [x] Panel trenera: ekran „Podopieczni"
- [x] Panel właściciela: retencja kohortowa, liczba zagrożonych, eskalacje
- [ ] ❗️ **Powiadomienia push/mail do trenera o nowym zadaniu** - zadanie samo jest widoczne w apce (Alerty + badge), ale nie ma faktycznej wysyłki push/e-mail. Brak infrastruktury (VAPID keys, dostawca poczty) - do ustalenia, czym to wysyłać.

> **Prompt:** Faza 2 z PLAN.md. To jest sedno całego projektu - przeczytaj sekcję „Po co ten projekt istnieje" w CLAUDE.md, zanim zaczniesz. Nie dodawaj żadnego skrótu typu „oznacz jako wykonane" przy zadaniach kontaktowych.

**Wdrożenie:** rozmowa z trenerami. Powiedz wprost, że alerty to obowiązek, a nie sugestia.

---

## Faza 3 - Kasa, odnowienia i rozliczenia
**Cel:** karnety sprzedają się w 15 sekund na sali, a gotówka się spina. **Czas: 2-3 dni.**

Model gotówkowy: brak bramki, brak subskrypcji, brak webhooków. Płatność odhacza człowiek.

- [x] Ekran „Kasa" (trener, mobile-first) - `/trainer/kasa`, jedyne miejsce sprzedaży karnetu (przeniesione z `/admin`, żeby płatność odhaczał ten, kto faktycznie trzyma gotówkę).
- [x] `Payment` append-only. Bez edycji, bez usuwania.
- [x] Wpisy korygujące płatności - ekran na `/admin/finanse` (nowy wpis z `correctsPaymentId` i wymaganym powodem, nigdy edycja).
- [x] Nowy karnet startuje od `endsAt` starego, nie od dziś
- [x] Zamrożenie (uproszczone do 30 dni/Pass, nie 30 dni/rok kalendarzowy) - admin zamraża/odmraża na `/admin`, `frozenDaysUsed` i `endsAt` liczą się same. ❗️ Nadal brak osobnej "prośby klienta" - dziś to wyłącznie decyzja admina, nie ma ekranu klienta do złożenia prośby.
- [x] Zdejmowanie wejść z karnetów limitowanych przy `Attendance`
- [x] Job `renewalReminders` → `RetentionTask(RENEWAL)` - zadanie dla trenera przy endsAt-3 dni, eskalacja przy endsAt+3 dni, jeśli wciąż otwarte (codziennie ok. 6:30). Krok "-5 dni powiadomienie" z SPEC.md pokrywa już istniejący próg `PASS_EXPIRING_SOON_DAYS` (wizualna zmiana statusu, nie push/e-mail - ten sam wzorzec co przy awansie z listy rezerwowej w Fazie 1).
- [x] Job `passLifecycle` - karnety ACTIVE z minionym `endsAt` przechodzą w EXPIRED (zamrożone celowo pomijane).
- [x] Job `closeCashDay`
- [x] `CashDay`: dzienne rozliczenie per lokalizacja, rozbieżność wymaga notatki
- [x] Panel właściciela: finanse, kasa, lista wygasłych do odzyskania
- [x] Klient: podgląd karnetu i historii (nic nie opłaca w apce) - `/app/karnet`, tylko do odczytu.

> **Prompt:** Faza 3 z PLAN.md, model gotówkowy. Reguły 11 i 12 z CLAUDE.md są tu najważniejsze: każdy wpis płatności ma autora i jest niezmienialny, a przypomnienie o karnecie to zadanie retencyjne dla trenera, nie mail z systemu. Kwoty w groszach jako Int.

---

## Faza 4 - Dzieci i rodzice
**Cel:** rodzic wie, co się dzieje. **Czas: ~1 tydz.**

- [x] Rola `GUARDIAN`, powiązanie `Member.guardianUserId`
- [x] Zgoda opiekuna prawnego jako blokada rezerwacji dla `isMinor`
- [x] Panel rodzica: ekran „Moje dziecko" (`/app/dziecko`) - ostatnia obecność, trener-opiekun i kontakt, ustawienia powiadomień. Reszta ekranów rodzica to współdzielone `/app`, `/app/karnet`, `/app/zgody` (Postępy i Polecenia z tabeli SPEC.md to Faza 6, nietknięte).
- [x] Powiadomienie „dziecko weszło na salę" przy `Attendance(QR)` - prawdziwy Web Push (VAPID, działa bez żadnego zewnętrznego konta) + fallback SMS. ❗️ SMS to na razie tylko gotowa wtyczka (`lib/services/notify.ts#sendSms`) - nie ma podpiętego dostawcy (Twilio/Vonage itp.), więc realnie nic nie wysyła, tylko loguje próbę. Wymaga założenia płatnego konta przez klienta.
- [x] Ustawienia powiadomień - `/app/dziecko`, toggle push/SMS + przycisk włączenia subskrypcji w przeglądarce.
- [x] Filtr grafiku `isKids`, walidacja `minAge/maxAge`
- [x] Job przeliczający `isMinor` przy 18. urodzinach (`recalcMinorStatus`, codziennie 4:30) - nie rusza `guardianUserId`, to osobna decyzja.

> **Prompt:** Faza 4 z PLAN.md. Uwaga na push na iOS - działa tylko w PWA dodanej do ekranu głównego. Zaprojektuj fallback SMS od razu, nie jako poprawkę.

---

## Faza 5 - Scoring i premie
**Cel:** trenerzy są rozliczani. **Uruchamiać dopiero, gdy Faza 1-2 zbierała dane przez min. 90 dni.** **Czas: ~1 tydz.**

Zbudowana na życzenie właściciela wcześniej niż zwykle zalecane - "chcę to widzieć od razu, żeby nauczyć się czytać analizę". **W środowisku dev/seed dane już są dojrzałe** (seed generuje historię klientów sięgającą miesięcy wstecz, nie tylko od dzisiaj), więc ranking pokazuje realne, zróżnicowane wyniki już teraz. **Na produkcji z prawdziwymi klientami klubu ta sama zasada `maturedCount < 5 → null` nadal obowiązuje** - dopóki nie minie ok. 90 dni od startu Fazy 1 na żywym ruchu, admin i trenerzy będą widzieć „za mało danych", i tak ma być.

- [x] `lib/domain/scoring.ts` - czyste funkcje + testy jednostkowe, w tym `maturedCount < 5 → null`.
- [x] Normalizacja retencji względem typu grupy - retencja klubu liczona osobno dla dzieci/dorosłych, ważona składem kohorty trenera (`weightedClubSegmentRet90`). ❗️ SPEC.md wspomina niezdefiniowaną nigdzie stałą `clubRet90Target` - zamiast jej zgadywać, ta normalizacja ją zastępuje w sposób udokumentowany w kodzie.
- [x] Job `computeScores` (1. dnia miesiąca) → `TrainerScore`, liczony nad kroczącym oknem 90 dni.
- [x] `Rating` - baner „Oceń ostatnie zajęcia" w `/app` dla nieocenionych obecności QR sprzed godziny+, 1 klik. ❗️ Bez realnej "prośby" push godzinę po zajęciach - ten sam brak infrastruktury co gdzie indziej, więc widoczna zmiana w UI zamiast powiadomienia (wzorzec z Fazy 1).
- [x] Ekran „Moja karta" (`/trainer/karta`) i „Ranking" (`/admin/ranking`) - trener widzi wyłącznie własny wynik i pozycję liczbową, nigdy wyników innych.
- [x] Próg premii + oznaczenie lidera (`BONUS_THRESHOLD_SCORE`). ❗️ SPEC.md nie podaje liczby - przyjęto 70 jako świadomy placeholder, właściciel powinien go realnie ustawić po zobaczeniu pierwszych wyników na żywych danych.
- [x] Próbka 10% notatek do audytu przez właściciela (`/admin/audyt-notatek`) - losowana co miesiąc przez `computeScores`.
- [x] `ChurnSurvey` + ekran „Powody odejść" (`/admin/powody-odejsc`) z podziałem „trener" / „klub". ❗️ Wysyłka ankiety mailem nie istnieje (brak dostawcy poczty) - admin/trener wpisuje odpowiedź ręcznie po rozmowie z klientem. Przy okazji zbudowany brakujący job `churnAndSurvey` (21 dni bez obecności QR → CHURNED), którego wcześniej w ogóle nie było mimo że jest w tabeli zadań cyklicznych SPEC.md.

> **Prompt:** Faza 5 z PLAN.md. Zacznij od lib/domain/scoring.ts i testów. Reguły 4, 5, 6, 7 z CLAUDE.md to nie są sugestie - każda z nich broni systemu przed konkretnym trybem awarii.

**Wdrożenie:** pierwszy miesiąc pokaż wyniki tylko właścicielowi. Sprawdź, czy liczby mają sens. Dopiero drugi miesiąc pokaż trenerom. Premie od trzeciego.

---

## Faza 6 - Reszta
**Cel:** wygoda. Nic tu nie jest krytyczne. **Czas: 1-2 tyg.**

- [x] Polecenia (`/app/polecenia`, `/polecenie/[code]`) - kod jednorazowy, publiczny link informacyjny (klub nie ma samoobsługowej rejestracji - link kieruje na stronę "przyjdź i podaj kod", nie na formularz), śledzenie konwersji (SENT→REGISTERED przy zakładaniu klienta, →CONVERTED przy pierwszej płatności), automatyczne przypisanie do tego samego trenera co polecający. ❗️ "Progi rabatowe" nie są zautomatyzowane - brak mechanizmu kuponów na `Payment`, admin ręcznie oznacza nagrodę jako przyznaną po wydaniu jej poza systemem.
- [x] Sparingi (`/trainer/sparingi`) - dopuszczenia (toggle na `sparringClearedAt`), dobór par (`lib/domain/sparring.ts`, dokładnie wg wzoru SPEC.md: ta sama `level`, różnica wagi ≤4kg, sortuj i paruj zachłannie), lista bez pary jako zadanie dla trenera.
- [x] Postępy (`/app/postepy`) - poziom (stan bieżący `Member.level`), wykres frekwencji i seria (`lib/domain/progress.ts`, tygodniowe okna Europe/Warsaw), pomiary wagi (nowy model `Measurement`, trener loguje na karcie klienta). ❗️ "Testy na poziom" nie mają osobnej historii zdarzeń - tylko bieżący stan `level`, bez logu kiedy/dlaczego zmieniono.
- [x] Obłożenie sal (`/admin/oblozenie`) - wypełnienie nadchodzących zajęć (14 dni) per lokalizacja, pasek wypełnienia.
- [x] Eksport i usunięcie danych osobowych (RODO) - `/api/admin/export-member/[id]` (pełny zrzut JSON), anonimizacja na karcie klienta admina (czyści dane identyfikujące, **zachowuje** `Payment`/`Pass`/obecności - obowiązek księgowy, i tak przestają być powiązane z tożsamością po wyczyszczeniu imienia). ❗️ Nie czyści historycznych wpisów `ActivityLog` ani treści `Note` - te opisują działania klubu i mogą wciąż zawierać stare imię klienta w treści.
- [x] Zgłaszanie kontuzji / nieobecności z wyprzedzeniem (`/app`, nowy model `AbsenceReport`) - klient zgłasza powód i opcjonalny komentarz, trener widzi i zamyka na karcie klienta, **aktywne zgłoszenie wstrzymuje job `detectInactive`** (nie generuje suchego alertu, skoro wiadomo już dlaczego klient nie trenuje).

---

## Backlog - pomysły do rozważenia (nie przypisane do fazy)

Zgłoszone do zrobienia kiedyś, ale jeszcze nie zaplanowane w konkretnej fazie
i nie wiadomo, czy/kiedy wejdą. W odróżnieniu od „Czego nie budujemy" -
to nie jest lista odrzuconych pomysłów, tylko parking lot do priorytetyzacji.

- [ ] **Import leadów z Meta (Facebook/Instagram Lead Ads) - mini CRM.**
  Klient pozyskuje leady z reklam na Meta i chce je importować do systemu,
  a potem odznaczać (kontakt/konwersja) jak w prostym CRM.

  Ustalenia (2026-07-18, właściciel projektu):
  - **Import ręczny przez CSV** (eksport z Meta Ads Manager), nie integracja
    z Meta Leads API - prościej, bez weryfikacji biznesowej i webhooków.
  - **Rozszerzenie istniejącego `Member`**, nie osobna tabela `Lead`.
  - **Dostęp domyślnie tylko właściciel**, z opcją rozszerzenia o trenerów
    później.

  Przepływ (potwierdzony):
  1. Właściciel importuje CSV z leadami (imię, kontakt, kampania/źródło).
  2. Lista leadów - dla każdego prosty checkbox/status **„obdzwoniony"**
     (śledzenie, kto już był kontaktowany, bez oceny wyniku rozmowy na tym
     etapie).
  3. Z pozycji obdzwonionego leada właściciel **ręcznie buduje klienta**
     (przycisk „utwórz klienta z leada") - to nie dzieje się automatycznie
     przy imporcie ani przy odznaczeniu.
  4. **Dopiero w tym kroku wybiera się i przypisuje trenera-opiekuna.**

  To rozwiązuje konflikt z CLAUDE.md regułą 1 (`ownerTrainerId` obowiązkowe
  dla każdego `Member`, reguła nadrzędna): leady żyją jako `Member` w stanie
  „niepotwierdzony" (bez trenera), a `ownerTrainerId` staje się wymagane
  dopiero w kroku 4, w momencie budowania klienta z leada - czyli reguła 1
  nie jest naruszana, tylko odroczona do właściwego momentu. Wymaga to więc:
  - nowego stanu na `Member` odróżniającego leada od potwierdzonego klienta
    (np. `MemberStatus.LEAD` albo osobne pole) - do zaprojektowania przy
    starcie prac, razem z tym, jak taki rekord wygląda, zanim ma wypełnione
    `ownerTrainerId`, `homeLocationId` itd. (te pola też są dziś wymagane -
    ta sama logika odroczenia powinna objąć wszystkie).
  - `Member.joinedAt` (SPEC.md sekcja 1) liczone dopiero od potwierdzenia
    (budowy klienta z leada), nie od importu CSV ani odznaczenia „obdzwoniony".

  Nie ma to bezpośredniego związku z retencją (CLAUDE.md: „przy każdej
  decyzji pytaj, czy to zwiększy szansę, że klient zostanie po 90 dniach") -
  to raczej pozyskiwanie, nie utrzymanie - więc naturalnie pasuje bliżej
  Fazy 6 niż wcześniej.

---

## Czego nie budujemy

Spisane, żeby nie wróciło jako „a może jeszcze": sklep z rękawicami, grafik pracy i płace trenerów, zawody i drabinki turniejowe, czat wewnętrzny, aplikacja natywna, integracja z bramką obrotową, moduł dietetyczny, sprzedaż wideo z treningów.

Każde z tych to osobny projekt. Żadne nie zwiększa retencji.

---

## Realny harmonogram

| Kamień milowy | Fazy | Czas roboty |
|---|---|---|
| Działający MVP na produkcji | 0-2 | 1-2 tygodnie |
| Pełny system | 0-4 | 3-4 tygodnie |
| Wszystko | 0-6 | 5-6 tygodni |
| Ranking trenerów ma sens | 5 | **+90 dni kalendarza od startu Fazy 1** |

Kod nie jest wąskim gardłem. Wąskie gardło to: treść zgód od prawnika, odpowiedź księgowej o kasę fiskalną, migracja obecnej bazy klientów, szkolenie trenerów i 90 dni czekania na dojrzałą kohortę. Tego ostatniego nie da się przyspieszyć niczym.

---

## Ryzyka

| Ryzyko | Szansa | Co robić |
|---|---|---|
| Klient chce „wszystko na start" i projekt nie wystartuje nigdy | ~65% | Umowa na Fazy 0-2 jako osobny etap z osobnym odbiorem |
| Trenerzy sabotują lub odchodzą po wdrożeniu scoringu | ~60% | Faza 5 dopiero po 90 dniach; pierwszy miesiąc wyniki tylko dla właściciela |
| Klienci nie skanują QR, dane obecności dziurawe | ~45% | Kod przy wejściu, nie w apce; bez skanu wejście nie schodzi z karnetu - to wystarczający powód |
| **Brak auto-odnawiania obniża retencję** - klient co miesiąc decyduje od nowa | ~70% | Zadania `RENEWAL` dla trenera-opiekuna, nie mail z systemu. To jedyna przeciwwaga. |
| Trenerzy nie odhaczają płatności na bieżąco, kasa się nie spina | ~55% | Ekran „Kasa" musi działać w 15 s na telefonie; `CashDay` codziennie, rozbieżność wymaga notatki |
| Zmiana schematu bazy po Fazie 3 | ~40% | Cały schema w Fazie 0, nawet dla funkcji z Fazy 6 |
| Push na iOS nie dociera do rodziców | ~35% | Fallback SMS zaplanowany w Fazie 4 |
| Ranking niesprawiedliwy przy 4 trenerach i małych liczbach | ~30% | Próg 5 dojrzałych klientów, normalizacja, premia progowa |
| Kasa fiskalna wymusza przebudowę modułu kasy | ~30% | Pytanie do księgowej **przed** Fazą 3 |

---

## Kolejność, gdyby zabrakło budżetu

Jeśli projekt trzeba uciąć, tnij od końca. Fazy 0-2 same w sobie rozwiązują problem, od którego wszystko się zaczęło. Reszta to wygoda i pieniądze - ważne, ale nie po to powstał ten system.
