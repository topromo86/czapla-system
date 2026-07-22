# toFitCONTROL

System zarządzania klubem sportowym: grafik zajęć i zapisy, karnety i płatności,
check-in QR, panel trenera i właściciela, warstwa retencji (alerty, kohorty,
scoring) oraz powiadomienia (push / e-mail). Zbudowany na Next.js (App Router),
Prisma i PostgreSQL.

> Pierwsze wdrożenie: **Czapla Boxing** (Mikołów i Tychy). Nazwa klubu widoczna dla
> klubowiczów (logo, ekran logowania, e-maile relacyjne) jest odrębna od nazwy
> produktu — tę część konfiguruje się per wdrożenie.

## Uruchomienie lokalne

```bash
npm install
npx prisma migrate dev      # migracje + generacja klienta Prisma
npm run dev                 # serwer deweloperski na http://localhost:3000
```

Zmienne środowiskowe: skopiuj `.env.example` do `.env` i uzupełnij (baza,
sekret Auth.js, opcjonalnie SMTP/VAPID/Google OAuth — funkcje zależne od
konfiguracji włączają się dopiero, gdy odpowiednie zmienne są ustawione).

## Skrypty

```bash
npm run dev          # serwer deweloperski
npm run build        # build produkcyjny
npm run lint         # ESLint
npx tsc --noEmit     # kontrola typów
npx vitest run       # testy jednostkowe (czyste funkcje domenowe w lib/domain)
```

## Konwencje

Zasady projektu i pułapki (strefy czasu, kwoty w groszach, jedno miejsce
autoryzacji) opisuje `AGENTS.md` / `CLAUDE.md`. Plan i status prac: `PLAN.md`.
