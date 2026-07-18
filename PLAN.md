# PLAN - kolejność budowy

Fazy realizuj **po kolei**. Nie zaczynaj kolejnej, dopóki poprzednia nie jest wdrożona i przetestowana na żywym ruchu.

Kolejność nie jest przypadkowa: najpierw to, co zbiera dane o retencji, potem to, co na tych danych operuje. Ranking trenerów jest bezużyteczny przez pierwsze 90 dni, bo nie ma dojrzałej kohorty - dlatego jest w Fazie 5, a nie w Fazie 1, mimo że to główny cel projektu.

Legenda: `[ ]` do zrobienia · `[x]` gotowe

---

## Faza 0 - Fundament
**Cel:** puste, ale wdrożone i działające repo. **Czas: 1-2 dni.**

- [ ] `create-next-app` (TypeScript, App Router, Tailwind), ESLint + Prettier
- [ ] Prisma + Postgres (Neon), połączenie, pierwsza migracja
- [ ] Pełny schema z `SPEC.md` sekcja 1 - cały, na raz. Zmiana schematu później jest droga.
- [ ] Seed deterministyczny wg `SPEC.md` sekcja 5
- [ ] Auth.js: e-mail + hasło, 4 role, `lib/auth/guard.ts` z jednym miejscem autoryzacji
- [ ] Design tokens z `CLAUDE.md` → `globals.css` + Tailwind theme, fonty (Anton, Archivo, IBM Plex Mono)
- [ ] shadcn/ui init, przykrycie domyślnym motywem tokenami
- [ ] Deploy na Vercel, env dev/prod, GitHub Actions: lint + typecheck + testy

> **Prompt:** Przeczytaj CLAUDE.md i SPEC.md. Wykonaj Fazę 0 z PLAN.md. Zacznij od pełnego schema Prisma - pokaż mi go do akceptacji przed migracją. Nie pisz jeszcze żadnego UI poza layoutem i stroną logowania.

---

## Faza 1 - Zapisy i obecności
**Cel:** klient zapisuje się i melduje kodem QR. Od tego momentu zbierają się dane. **Czas: 1-2 tyg.**

- [ ] `lib/domain/booking.ts` - czyste funkcje: okno odwołania, awans z listy rezerwowej, walidacja wieku. **Testy jednostkowe najpierw.**
- [ ] Job `generateSessions` (8 tygodni do przodu)
- [ ] Ekran grafiku: 7 dni, filtr lokalizacji, zapis, odwołanie, lista rezerwowa
- [ ] Awans z listy rezerwowej w transakcji + powiadomienie
- [ ] Zgody: modele, ekran podpisu przy pierwszym logowaniu, **blokada rezerwacji po stronie serwera** bez kompletu
- [ ] Karnet minimum: właściciel ręcznie zakłada `Pass` klientowi, wygasły karnet blokuje rezerwację. Pełna kasa dopiero w Fazie 3 - tu chodzi tylko o to, żeby warunek rezerwacji miał na czym stać.
- [ ] Check-in QR: strony `/qr/[locationId]`, walidacja okna −30/+20 min, `Attendance(QR)`
- [ ] Panel trenera - ekran „Dziś": lista obecności, ręczne uzupełnianie braków (`method: MANUAL`)
- [ ] Odwołanie zajęć / zastępstwo przez trenera
- [ ] PWA: manifest, service worker, instalacja na ekranie głównym

> **Prompt:** Faza 1 z PLAN.md. Zacznij od lib/domain/booking.ts i testów - dopiero potem UI. Reguła nr 2 i nr 9 z CLAUDE.md są krytyczne: obecność MANUAL musi być oznaczona, a rezerwacja bez kompletu zgód ma się nie udać na serwerze.

**Wdrożenie:** tu jest pierwsza premiera. Klub używa systemu do zapisów. Trenerzy jeszcze nie są oceniani - i nie mów im, że będą, dopóki dane nie są wiarygodne.

---

## Faza 2 - Warstwa retencji
**Cel:** system zaczyna pilnować relacji. To jest właściwy produkt. **Czas: 1-2 tyg.**

- [ ] Przypisanie opiekuna: `ownerTrainerId` obowiązkowy przy zakładaniu klienta
- [ ] Karta klienta: dane, cel, staż, historia obecności
- [ ] Notatki (`Note`) - dodawanie, walidacja min. 30 znaków na serwerze
- [ ] `OnboardingStep` - generowanie 3 etapów przy `joinedAt`, ekran checklisty
- [ ] Job `detectInactive` - alerty 7/14 dni
- [ ] Job `expireOldTasks` - eskalacja
- [ ] Panel trenera: ekran „Alerty" z badge, zamknięcie **wyłącznie z notatką**
- [ ] Panel trenera: ekran „Podopieczni"
- [ ] Panel właściciela: retencja kohortowa, liczba zagrożonych, eskalacje
- [ ] Powiadomienia push/mail do trenera o nowym zadaniu

> **Prompt:** Faza 2 z PLAN.md. To jest sedno całego projektu - przeczytaj sekcję „Po co ten projekt istnieje" w CLAUDE.md, zanim zaczniesz. Nie dodawaj żadnego skrótu typu „oznacz jako wykonane" przy zadaniach kontaktowych.

**Wdrożenie:** rozmowa z trenerami. Powiedz wprost, że alerty to obowiązek, a nie sugestia.

---

## Faza 3 - Kasa, odnowienia i rozliczenia
**Cel:** karnety sprzedają się w 15 sekund na sali, a gotówka się spina. **Czas: 2-3 dni.**

Model gotówkowy: brak bramki, brak subskrypcji, brak webhooków. Płatność odhacza człowiek.

- [ ] **Przed startem:** odpowiedź od księgowej klienta w sprawie kasy fiskalnej. Może zmienić cały moduł.
- [ ] Ekran „Kasa" (trener, mobile-first): klient + plan + metoda + lokalizacja, jedno kliknięcie. Ma działać na telefonie, na sali, przy 12 osobach czekających.
- [ ] `Payment` append-only + wpisy korygujące. Bez edycji, bez usuwania.
- [ ] Nowy karnet startuje od `endsAt` starego, nie od dziś
- [ ] Zamrożenie (maks. 30 dni/rok): prośba klienta → akceptacja właściciela
- [ ] Zdejmowanie wejść z karnetów limitowanych przy `Attendance`
- [ ] Job `renewalReminders` → `RetentionTask(RENEWAL)`, harmonogram z `SPEC.md`
- [ ] Job `passLifecycle`, job `closeCashDay`
- [ ] `CashDay`: dzienne rozliczenie per lokalizacja, rozbieżność wymaga notatki
- [ ] Panel właściciela: finanse, kasa, lista wygasłych do odzyskania
- [ ] Klient: podgląd karnetu i historii (nic nie opłaca w apce)

> **Prompt:** Faza 3 z PLAN.md, model gotówkowy. Reguły 11 i 12 z CLAUDE.md są tu najważniejsze: każdy wpis płatności ma autora i jest niezmienialny, a przypomnienie o karnecie to zadanie retencyjne dla trenera, nie mail z systemu. Kwoty w groszach jako Int.

---

## Faza 4 - Dzieci i rodzice
**Cel:** rodzic wie, co się dzieje. **Czas: ~1 tydz.**

- [ ] Rola `GUARDIAN`, powiązanie `Member.guardianUserId`
- [ ] Zgoda opiekuna prawnego jako blokada rezerwacji dla `isMinor`
- [ ] Panel rodzica: wszystkie ekrany z `SPEC.md` sekcja 3
- [ ] **Powiadomienie „dziecko weszło na salę"** przy `Attendance(QR)` - push + fallback SMS
- [ ] Ustawienia powiadomień
- [ ] Filtr grafiku `isKids`, walidacja `minAge/maxAge`
- [ ] Job przeliczający `isMinor` przy 18. urodzinach

> **Prompt:** Faza 4 z PLAN.md. Uwaga na push na iOS - działa tylko w PWA dodanej do ekranu głównego. Zaprojektuj fallback SMS od razu, nie jako poprawkę.

---

## Faza 5 - Scoring i premie
**Cel:** trenerzy są rozliczani. **Uruchamiać dopiero, gdy Faza 1-2 zbierała dane przez min. 90 dni.** **Czas: ~1 tydz.**

- [ ] `lib/domain/scoring.ts` - czyste funkcje. **Testy jednostkowe obowiązkowo**, łącznie z przypadkiem `maturedCount < 5 → null`
- [ ] Normalizacja retencji względem typu grupy
- [ ] Job `computeScores` (miesięczny) → `TrainerScore`
- [ ] `Rating` - prośba o ocenę godzinę po zajęciach, 1 kliknięcie
- [ ] Ekran „Moja karta" (trener) i „Ranking" (właściciel)
- [ ] Próg premii + oznaczenie lidera
- [ ] Próbka 10% notatek do audytu przez właściciela
- [ ] `ChurnSurvey` + ekran „Powody odejść" z podziałem „trener" / „klub"

> **Prompt:** Faza 5 z PLAN.md. Zacznij od lib/domain/scoring.ts i testów. Reguły 4, 5, 6, 7 z CLAUDE.md to nie są sugestie - każda z nich broni systemu przed konkretnym trybem awarii.

**Wdrożenie:** pierwszy miesiąc pokaż wyniki tylko właścicielowi. Sprawdź, czy liczby mają sens. Dopiero drugi miesiąc pokaż trenerom. Premie od trzeciego.

---

## Faza 6 - Reszta
**Cel:** wygoda. Nic tu nie jest krytyczne. **Czas: 1-2 tyg.**

- [ ] Polecenia: kody, śledzenie konwersji, rabaty, przypisanie do opiekuna
- [ ] Sparingi: dopuszczenia, dobór par, lista bez pary
- [ ] Postępy: pomiary, testy na poziom, wykres frekwencji, seria
- [ ] Obłożenie sal (właściciel)
- [ ] Eksport i usunięcie danych osobowych (RODO)
- [ ] Zgłaszanie kontuzji / nieobecności z wyprzedzeniem

---

## Backlog - pomysły do rozważenia (nie przypisane do fazy)

Zgłoszone do zrobienia kiedyś, ale jeszcze nie zaplanowane w konkretnej fazie
i nie wiadomo, czy/kiedy wejdą. W odróżnieniu od „Czego nie budujemy" -
to nie jest lista odrzuconych pomysłów, tylko parking lot do priorytetyzacji.

- [ ] **Import leadów z Meta (Facebook/Instagram Lead Ads) - mini CRM.**
  Klient pozyskuje leady z reklam na Meta i chce je importować do systemu,
  a potem odznaczać (kontakt/konwersja) jak w prostym CRM. Do ustalenia przy
  starcie prac: (1) import ręczny (CSV eksportowany z Meta Ads Manager) czy
  integracja z Meta Leads API (wymaga weryfikacji biznesowej i webhooków -
  dużo cięższe); (2) model danych - osobna tabela `Lead` (imię, kontakt,
  źródło/kampania, data importu, status: NOWY/SKONTAKTOWANO/PRZEKONWERTOWANY/
  ODRZUCONY, notatki, opcjonalne przypisanie do trenera) czy rozszerzenie
  istniejącego `Member`; (3) czy konwersja leada ma tworzyć realnego `Member`
  (i jeśli tak - to jest naturalny punkt startowy dla `Member.joinedAt`,
  patrz SPEC.md sekcja 1); (4) kto ma dostęp - właściciel, czy też trenerzy.
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
