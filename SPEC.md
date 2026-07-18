# SPEC - model danych, reguły, ekrany

Dokument referencyjny. Czytaj sekcję odpowiadającą modułowi, nad którym pracujesz.
Reguły nadrzędne są w `CLAUDE.md` - w razie konfliktu wygrywa `CLAUDE.md`.

---

## 1. Model danych

Prisma. Wszystkie `id` to `cuid()`. Wszystkie tabele mają `createdAt`, `updatedAt`.

### Tożsamość i role

```
User
  id, email (unique), passwordHash?, name, phone?
  role: ADMIN | TRAINER | MEMBER | GUARDIAN
  emailVerifiedAt?, lastLoginAt?

Location
  id, name           // "Mikołów" | "Tychy"
  address, timezone  // "Europe/Warsaw"

Trainer
  id, userId (unique), locationId
  hiredAt, active: Boolean
```

### Klienci

```
Member
  id, userId?                  // null dla dzieci bez własnego konta
  guardianUserId?              // opiekun prawny, wymagany gdy isMinor
  ownerTrainerId               // OPIEKUN - kluczowe pole całego systemu
  homeLocationId
  firstName, lastName, birthDate
  isMinor: Boolean             // wyliczane z birthDate, przeliczane jobem
  weightKg?, level: WHITE | YELLOW | ORANGE | GREEN
  goal?: String                // cel ustalony na rozmowie wstępnej
  status: ACTIVE | FROZEN | CHURNED
  joinedAt, churnedAt?
  sparringClearedAt?, sparringClearedByTrainerId?

  @@index([ownerTrainerId, status])
  @@index([status, joinedAt])
```

`Member.joinedAt` to data pierwszej opłaconej transakcji lub pierwszej obecności - nie data założenia konta. Definicja musi być jedna, bo od niej zależy cała retencja.

### Zajęcia

```
ClassTemplate
  id, locationId, trainerId
  name, weekday (0-6), startTime ("18:00"), durationMin
  capacity, minAge?, maxAge?, isKids: Boolean
  active: Boolean

Session                        // konkretne zajęcia w konkretnym dniu
  id, templateId?, locationId, trainerId
  substituteTrainerId?         // zastępstwo
  name, startsAt, endsAt, capacity
  status: SCHEDULED | CANCELLED
  cancelledReason?

  @@index([startsAt, locationId])

Booking
  id, sessionId, memberId
  status: BOOKED | WAITLIST | CANCELLED | NO_SHOW | ATTENDED
  waitlistPosition?
  createdAt, cancelledAt?

  @@unique([sessionId, memberId])

Attendance
  id, sessionId, memberId
  checkedInAt
  method: QR | MANUAL          // MANUAL nie liczy się do KPI trenera
  recordedByUserId?            // kto wpisał ręcznie

  @@unique([sessionId, memberId])
```

### Retencja - serce systemu

```
Note
  id, memberId, authorUserId
  kind: CONTACT | ONBOARDING | GENERAL
  body                         // min. 30 znaków, walidacja na serwerze
  createdAt

OnboardingStep
  id, memberId
  step: 1 | 2 | 3
  dueAt, completedAt?, noteId?

  @@unique([memberId, step])

RetentionTask
  id, memberId, trainerId
  type: INACTIVE_7 | INACTIVE_14 | RENEWAL
  createdAt, dueAt
  escalatedAt?
  closedAt?, closingNoteId?     // zamknięcie WYMAGA notatki

  @@index([trainerId, closedAt])

ChurnReason
  id, label, trainerControllable: Boolean

ChurnSurvey
  id, memberId, sentAt, answeredAt?
  reasonId?, comment?

Rating                          // ocena zajęć przez klienta
  id, sessionId, memberId, score (1-5), comment?
  @@unique([sessionId, memberId])
```

**Etapy onboardingu** (`OnboardingStep.dueAt` liczone od `Member.joinedAt`):

| Etap | Termin | Treść |
|---|---|---|
| 1 | +3 dni | Rozmowa wstępna, ustalenie celu, pomiar wyjściowy |
| 2 | +14 dni | Kontakt kontrolny |
| 3 | +84 dni | Retest i rozmowa o postępach |

### Płatności

Model gotówkowy. Brak bramki, brak subskrypcji, brak webhooków.

```
Plan
  id, name, priceGross (grosze, Int)
  entriesPerMonth?             // null = OPEN
  durationDays                 // zwykle 30
  forMinors: Boolean
  active

Pass
  id, memberId, planId
  startsAt, endsAt
  entriesLeft?                 // null dla OPEN
  status: ACTIVE | FROZEN | EXPIRED | CANCELLED
  frozenAt?, frozenDaysUsed
  renewalReminderSentAt?
  soldByUserId                 // kto sprzedał

Payment                        // wpis niezmienialny
  id, memberId, passId?
  amountGross (grosze, Int)
  method: CASH | BLIK | TRANSFER
  locationId                   // gdzie przyjęto gotówkę
  recordedByUserId             // kto odhaczył - obowiązkowe
  recordedAt
  correctsPaymentId?           // wpis korygujący, jeśli pomyłka
  note?

  @@index([locationId, recordedAt])
  @@index([memberId, recordedAt])

CashDay                        // dzienne rozliczenie kasy
  id, locationId, date
  expectedGross                // suma Payment(CASH) tego dnia
  countedGross?                // ile faktycznie policzono
  closedByUserId?, closedAt?
  discrepancyNote?

  @@unique([locationId, date])
```

Kwoty **zawsze w groszach jako Int**. Nigdy Float.

`Payment` jest **append-only**. Nie ma edycji ani usuwania - pomyłka to nowy wpis z `correctsPaymentId` i kwotą ujemną. Bez tego nie da się rozliczyć gotówki.

### Zgody

```
ConsentType
  id, key, label, version, required: Boolean, forMinorsOnly: Boolean
  bodyHtml                     // treść dostarcza prawnik, nie generuj

Consent
  id, memberId, consentTypeId, version
  grantedAt, revokedAt?, ipAddress, userAgent
  grantedByUserId              // przy dziecku: opiekun prawny
```

Typy: `reg` (regulamin), `rodo`, `health` (deklaracja zdrowia - ważność 12 miesięcy), `image` (wizerunek, dobrowolna), `guardian` (zgoda opiekuna, tylko dla nieletnich).

### Reszta

```
Referral
  id, code (unique), referrerMemberId, refereeMemberId?
  status: SENT | REGISTERED | CONVERTED | REWARDED
  convertedAt?, rewardedAt?

TrainerScore
  id, trainerId, period ("2026-07")
  ret90?, ret90Normalized?, rating?, alertRate?, onboardingRate?
  score?                       // null gdy maturedCount < 5
  maturedCount, computedAt

  @@unique([trainerId, period])
```

---

## 2. Reguły biznesowe

### Rezerwacje

- Zapis możliwy, jeśli: komplet wymaganych zgód + aktywny karnet + wolne miejsce (lub lista rezerwowa) + wiek pasuje do `minAge/maxAge`.
- Karnet limitowany: rezerwacja **nie** zdejmuje wejścia. Wejście zdejmuje dopiero `Attendance` albo `NO_SHOW`.
- Odwołanie do 4 h przed `startsAt`: bezpłatne. Później: `NO_SHOW`, wejście przepada.
- Odwołanie zwalnia miejsce → pierwsza osoba z listy rezerwowej awansuje **w tej samej transakcji** i dostaje powiadomienie.
- Odwołanie całych zajęć przez trenera: wszystkie rezerwacje → `CANCELLED`, powiadomienie do wszystkich, żadne wejście nie przepada.

### Check-in QR

Wersja pierwsza (wystarczy na start):

1. Przy wejściu wisi stały kod QR z `locationId` (osobny dla Mikołowa i Tychów).
2. Klient skanuje w aplikacji → POST z `locationId` + tożsamość z sesji.
3. Serwer akceptuje, jeśli klient ma rezerwację `BOOKED` na sesję w tej lokalizacji zaczynającą się w oknie **−30 / +20 minut**.
4. Tworzy `Attendance(method: QR)`, `Booking.status = ATTENDED`, zdejmuje wejście z karnetu.

Ograniczenie: kod można sfotografować i zeskanować z domu. Dla klubu bokserskiego to ryzyko akceptowalne - nikt nie oszukuje po to, żeby nie potrenować. Jeśli kiedyś stanie się problemem: tablet przy wejściu z kodem rotującym co 30 s (TOTP). Nie buduj tego teraz.

### Alerty retencyjne (job codzienny)

```
dla każdego Member ze status = ACTIVE:
  daysSince = dni od ostatniej Attendance (dowolna metoda)
  jeśli daysSince >= 14 i brak otwartego INACTIVE_14:
    utwórz RetentionTask(INACTIVE_14), escalatedAt = now, powiadom trenera + właściciela
  inaczej jeśli daysSince >= 7 i brak otwartego INACTIVE_7:
    utwórz RetentionTask(INACTIVE_7), powiadom trenera
```

Zamknięcie zadania: trener pisze notatkę (min. 30 znaków) → `Note(kind: CONTACT)` → `RetentionTask.closedAt`, `closingNoteId`. Nowa obecność klienta **nie zamyka zadania automatycznie** - trener ma odnotować, o czym rozmawiali.

### Ankieta wyjścia (job codzienny)

21 dni od ostatniej obecności → `Member.status = CHURNED`, `churnedAt`, wyślij `ChurnSurvey` mailem. Powody z `trainerControllable = true` („brak postępów", „nie czułem się częścią grupy", „brak partnera do sparingu") raportuj osobno od reszty.

### Wynik trenera (job miesięczny, 1. dnia miesiąca)

```
matured   = klienci trenera z joinedAt <= now - 90 dni
jeśli matured.length < 5 → score = null, koniec

ret90     = matured.filter(status != CHURNED).length / matured.length
clubRet90 = to samo dla całego klubu
ret90Norm = clamp(ret90 / clubRet90 * clubRet90Target, 0, 1)   // normalizacja

rating      = średnia Rating dla sesji tego trenera z ostatnich 90 dni
alertRate   = zadania zamknięte w terminie / wszystkie zadania w okresie
onbRate     = ukończone OnboardingStep / wszystkie wymagalne

score = round( 0.45*ret90Norm + 0.20*((rating-3)/2) + 0.20*alertRate + 0.15*onbRate ) * 100
```

Do `ret90` liczą się tylko obecności z `method = QR`. Wpisy `MANUAL` ignoruj.

**Audyt jakości**: 10% losowych notatek z `kind = CONTACT` miesięcznie oznaczaj do przeglądu przez właściciela. Bez tego trenerzy zaczną wklejać formułki - to nie jest hipoteza, to pewne.

### Karnety i płatności - model gotówkowy

Klient płaci gotówką lub BLIK-iem na telefon. Trener albo właściciel odhacza to w systemie. Nie ma automatu.

**Sprzedaż karnetu** (trener lub właściciel, ekran „Kasa"):
1. Wybiera klienta i plan.
2. Wpisuje metodę: `CASH` / `BLIK` / `TRANSFER` i lokalizację.
3. System tworzy `Payment` (z `recordedByUserId`) i `Pass` z `startsAt = dziś`, `endsAt = dziś + plan.durationDays`.
4. Jeśli klient ma jeszcze aktywny karnet - nowy startuje od `endsAt` starego, nie od dziś. Inaczej okradasz klienta z dni i on to zauważy.

**Wygaśnięcie:**
- `endsAt` mija → `Pass.status = EXPIRED`. Brak karencji - nie ma czego ponawiać.
- Wygasły karnet = brak możliwości rezerwacji. Blokada na serwerze.

**Odnowienia - to jest mechanika retencyjna, nie księgowa** (patrz reguła 12 w `CLAUDE.md`):

| Moment | Co się dzieje |
|---|---|
| `endsAt − 5 dni` | Powiadomienie push/mail do klienta |
| `endsAt − 3 dni` | `RetentionTask(RENEWAL)` dla trenera-opiekuna |
| `endsAt + 3 dni` | Eskalacja do właściciela, klient na liście „do odzyskania" |
| `endsAt + 21 dni` | `CHURNED` + ankieta wyjścia (jak przy braku obecności) |

Zamknięcie `RENEWAL` wymaga notatki, tak samo jak alertów 7/14. Reakcja na te zadania wchodzi do `alertRate` w wyniku trenera.

**Zamrożenie:** maks. 30 dni w roku kalendarzowym. `endsAt` przesuwa się o liczbę dni zamrożenia. Klient prosi w aplikacji, właściciel akceptuje.

**Zmiana planu:** dopiero przy kolejnym zakupie. Brak proraty - nie ma czego prorotować.

**Rozliczenie kasy** (`CashDay`, ekran właściciela): na koniec dnia system pokazuje sumę `Payment(CASH)` per lokalizacja. Ktoś liczy gotówkę i wpisuje `countedGross`. Rozbieżność wymaga notatki. Bez tego dwie lokalizacje z gotówką rozjadą się w miesiąc.

**Kasa fiskalna:** przed budową zapytaj księgową klienta, czy sprzedaż karnetów wymaga ewidencji na kasie i jaki ma być obieg paragonów. Może to zmienić cały ten moduł. Nie zgaduj.

### Dobór par sparingowych

Kandydaci: `status = ACTIVE`, `!isMinor`, `sparringClearedAt != null`.
Para: ta sama `level` + różnica `weightKg` ≤ 4 kg. Sortuj po wadze, paruj zachłannie.
Osoby bez pary wypisz osobno - to lista zadań dla trenera, nie statystyka.

---

## 3. Ekrany

### Klient (`/app`)
| Ekran | Zawartość |
|---|---|
| Grafik | 7 dni, filtr lokalizacji, zapis/odwołanie, lista rezerwowa |
| Karnet | stan, data końca, prośba o zamrożenie, historia płatności (tylko podgląd - klient nic nie opłaca w apce) |
| Postępy | frekwencja 6 mies., poziom, testy, seria, cel, trener |
| Polecenia | kod, progi rabatowe, link |
| Zgody | lista, podpis, wycofanie |

### Rodzic (`/app`, rola GUARDIAN)
| Ekran | Zawartość |
|---|---|
| Moje dziecko | ostatnia obecność, trener, kontakt, ustawienia powiadomień |
| Grafik | tylko zajęcia z `isKids = true` |
| Postępy | jak u klienta, wersja dziecięca testów |
| Płatności | jak u klienta |
| Zgody | + zgoda opiekuna prawnego |

Powiadomienie „dziecko weszło na salę" przy `Attendance(QR)`. Najwyżej oceniana funkcja w zajęciach dziecięcych - potraktuj priorytetowo.

### Trener (`/trainer`)
| Ekran | Zawartość |
|---|---|
| Dziś | lista obecności, QR automatyczne, ręczne uzupełnienie braków |
| Kasa | sprzedaż karnetu: klient + plan + metoda, jedno kliknięcie. Musi działać na telefonie, na sali, w 15 sekund |
| Alerty | otwarte zadania (w tym `RENEWAL`), badge z licznikiem, zamknięcie tylko z notatką |
| Podopieczni | tabela: status, ostatnia obecność, cel, onboarding |
| Sparingi | pary + lista bez pary |
| Moja karta | KPI, wynik, pozycja w rankingu |

Trener widzi **wyłącznie swoich podopiecznych**. Nie widzi wyników innych trenerów poza własną pozycją w rankingu.

### Właściciel (`/admin`)
| Ekran | Zawartość |
|---|---|
| Ranking trenerów | karty punktowe, próg premii, oznaczenie „za mało danych" |
| Retencja | aktywni, ret90, zagrożeni, tabela kohortowa |
| Finanse | przychód mies., podział na lokalizacje, struktura karnetów, LTV, lista wygasłych do odzyskania |
| Kasa | dzienne rozliczenie per lokalizacja, kto przyjął ile, rozbieżności, wpisy korygujące |
| Powody odejść | ankieta wyjścia, podział na „trener" / „klub" |
| Obłożenie | sesje per lokalizacja, wypełnienie |
| Notatki do audytu | 10% próbka z ostatniego miesiąca |

---

## 4. Zadania cykliczne

| Job | Częstotliwość | Zadanie |
|---|---|---|
| `generateSessions` | codziennie 03:00 | Sesje z szablonów na 8 tygodni do przodu |
| `detectInactive` | codziennie 06:00 | Alerty 7/14 dni |
| `expireOldTasks` | codziennie 06:15 | Eskalacja zadań otwartych > 7 dni |
| `churnAndSurvey` | codziennie 07:00 | 21 dni → CHURNED + ankieta |
| `passLifecycle` | codziennie 04:00 | Wygaśnięcia, koniec zamrożeń |
| `renewalReminders` | codziennie 06:30 | −5 dni powiadomienie, −3 dni zadanie, +3 dni eskalacja |
| `closeCashDay` | codziennie 22:00 | Wystawienie `CashDay` do rozliczenia per lokalizacja |
| `computeScores` | 1. dnia miesiąca 05:00 | `TrainerScore` + próbka do audytu |
| `classReminder` | co godzinę | Przypomnienie 2 h przed zajęciami |
| `ratingRequest` | co godzinę | Prośba o ocenę 1 h po zajęciach |

Na Vercel: Cron Jobs. Każdy job idempotentny - musi dać się uruchomić dwa razy bez skutków ubocznych.

---

## 5. Seed

Seed musi odtwarzać sytuację wyjściową klubu, inaczej nie zobaczysz, czy system działa:

- 2 lokalizacje, 4 trenerów o **różnej jakości pracy** (retencja od ~27% do ~63%)
- ~38 dorosłych + ~14 dzieci, rozłożonych na 11 miesięcy wstecz
- Część klientów bez celu i bez notatek - to ma być widoczne jako brak
- Część z ostatnią obecnością 7-20 dni temu - żeby alerty miały się z czego wygenerować
- Kilka nieudanych płatności
- Szablony zajęć zgodne z prototypem

Seed deterministyczny (stały seed RNG). Ten sam wynik za każdym razem.
