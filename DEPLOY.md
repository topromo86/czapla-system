# Wdrożenie na Vercel

Instrukcja dla toFitCONTROL. Krok 0 jest obowiązkowy — bez niego aplikacja
zbuduje się, ale nie ruszy.

## 0. Baza danych (NAJPIERW)

Lokalna baza (`npm run db:dev`) działa tylko na Twoim komputerze — Vercel jej
nie dosięgnie. Potrzebna jest hostowana baza PostgreSQL:

| Dostawca | Uwagi |
| --- | --- |
| **Neon** | darmowy plan wystarcza na start, ten sam Postgres, zero zmian w kodzie |
| Vercel Postgres | integruje się jednym kliknięciem z panelu Vercel |
| Supabase | darmowy plan, też Postgres |

Z panelu dostawcy skopiuj **connection string** — to będzie `DATABASE_URL`.

## 1. Kod na GitHub

Repozytorium nie ma jeszcze zdalnego adresu (`git remote` jest puste).
Załóż prywatne repo na GitHubie i wypchnij kod:

```bash
git remote add origin https://github.com/UZYTKOWNIK/czapla-system.git
git push -u origin main
```

Plik `.env` jest w `.gitignore`, więc hasła i klucze **nie trafią** do repo —
wpisuje się je w panelu Vercel (krok 3).

## 2. Projekt w Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → wybierz repo.
2. Framework: Next.js (wykryje sam). Nie zmieniaj komend build.
3. **Nie klikaj jeszcze Deploy** — najpierw zmienne (krok 3).

## 3. Zmienne środowiskowe

W Vercel: **Settings → Environment Variables**. Zaznacz wszystkie środowiska
(Production, Preview, Development).

Wymagane:

| Zmienna | Skąd wziąć |
| --- | --- |
| `DATABASE_URL` | connection string z kroku 0 |
| `AUTH_SECRET` | wygeneruj: `npx auth secret` albo `openssl rand -base64 32` |
| `CRON_SECRET` | dowolny długi losowy ciąg — chroni endpointy `/api/cron/*` |

Opcjonalne (funkcje działają dopiero po ich ustawieniu):

| Zmienna | Do czego |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | potwierdzenia zapisu i przypomnienia mailem |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | powiadomienia push (klucze są już w Twoim lokalnym `.env`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | logowanie przez Google |
| `SMS_PROVIDER_API_KEY` | SMS (dostawca nie jest jeszcze podpięty) |

`DATABASE_URL` musi być ustawiony **przed pierwszym buildem** — część stron
odpytuje bazę już na etapie budowania.

## 4. Migracje i dane startowe

Z lokalnego komputera, wskazując na bazę produkcyjną:

```bash
npx cross-env DATABASE_URL="<adres_bazy_produkcyjnej>" npx prisma migrate deploy
```

Następnie konfiguracja klubu (lokalizacje, plany i zgody pochodzą z `db seed`,
a kadra, superadmin, kategorie i grafik z `db:setup`):

```bash
npx cross-env DATABASE_URL="<adres_bazy_produkcyjnej>" npx prisma db seed
npx cross-env DATABASE_URL="<adres_bazy_produkcyjnej>" npm run db:setup
```

> `db seed` tworzy też dane testowe (klienci, historia). Na produkcji usuń je
> po zalogowaniu albo poproś o skrypt czyszczący.

**Zmień hasła** kont — skrypty zakładają je z tymczasowym `test1234`.

## 5. Deploy

Klik **Deploy** w Vercel (albo `git push` — każdy push na `main` wdraża się sam).

## Zadania cykliczne — uwaga o planie

`vercel.json` zawiera **10 zadań cron** (generowanie grafiku, przypomnienia,
zamknięcie kasy, retencja itd.).

Plan **Hobby (darmowy) pozwala tylko na 2 zadania i wyłącznie raz dziennie** —
przy 10 wdrożenie zostanie odrzucone. Masz dwa wyjścia:

- **Plan Pro** (~20 USD/mies.) — wszystkie zadania działają bez zmian, albo
- **zostaw 2 najważniejsze** w `vercel.json` (`generate-sessions` i
  `session-reminders`), resztę uruchamiaj ręcznie lub zewnętrznym
  harmonogramem (np. cron-job.org uderzający w `/api/cron/...`
  z nagłówkiem `Authorization: Bearer <CRON_SECRET>`).

## Po wdrożeniu — sprawdź

1. Logowanie (`dpilc@wp.pl`) i pulpit admina.
2. Grafik: zajęcia mają pełne nazwy rodzajów i kolorowe paski.
3. Zakładka **Ustawienia → Poczta e-mail** — test wysyłki (jeśli ustawiłeś SMTP).
4. Zmienione hasła kont.
