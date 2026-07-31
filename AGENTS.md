<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lokalna baza (`prisma dev`)

Baza deweloperska to lokalny serwer Prisma Postgres. Uruchamiasz go w **osobnym
oknie terminala** i zostawiasz otwarte — serwer żyje tak długo, jak to okno:

```
npm run db:dev      # baza (osobne okno, zostaw otwarte)
npm run dev         # aplikacja (drugie okno)
```

## Gdy aplikacja pokazuje „This page couldn't load"

To prawie zawsze baza, nie kod. W logach serwera zobaczysz jedno z dwóch:

- **`ECONNREFUSED`** — baza nie działa. Uruchom `npm run db:dev`.
- **`P1017` / „Server has closed the connection"** — baza zrywa połączenia.

Diagnoza i naprawa:

```
npm run db:doctor   # pokazuje stan, rozmiar danych i strumieni (nic nie zmienia)
npm run db:clean    # usuwa balast strumieni i osierocone blokady
```

`db:clean` wymaga **zatrzymanej** bazy (Ctrl+C w oknie `db:dev`) i nigdy nie
rusza katalogu z danymi (`.pglite`).

## Nigdy nie zabijaj procesu bazy

Bazę zatrzymuj **wyłącznie Ctrl+C** w jej oknie. Twarde ubicie (`taskkill /F`,
`kill -9`) w trakcie zapisu uszkadza katalog danych i wtedy przy starcie leci:

```
ERROR  Aborted(). Build with -sASSERTIONS for more info.   (@electric-sql/pglite)
```

Takiego katalogu nie da się odzyskać — pozostaje odtworzenie (niżej).

## Odtworzenie bazy od zera

Cały stan klubu jest w skryptach, więc nic nie trzeba odtwarzać z pamięci:

```
# 1. usuń uszkodzony katalog danych (Windows)
#    %LOCALAPPDATA%\prisma-dev-nodejs\Data\czapla
# 2. uruchom bazę w osobnym oknie
npm run db:dev
# 3. schemat + dane startowe + konfiguracja klubu
npx prisma migrate deploy
npx prisma db seed        # konfiguracja: lokalizacje, plany, zgody (+ dane testowe)
npm run db:setup          # kadra, superadmin, kategorie i grafik 22 zajęć
```

`db:setup` jest idempotentny — można go puszczać na pełnej bazie, nic nie
zdubluje. Odtwarza: 6 realnych trenerów (Daniel jako ADMIN z rekordem trenera,
czyli z przełącznikiem Admin/Trener), konto superadmina, kategorie zajęć oraz
grafik tygodniowy Tychy + Mikołów wraz z terminami na 8 tygodni.

## Dlaczego to się psuje

`prisma dev` prowadzi obok danych strumień zdarzeń (`durable-streams.sqlite`).
Aplikacja go nie używa, ale rośnie on bez końca — potrafił urosnąć do 9,7 GB
i wtedy wywracał bazę przy starcie (dane tabel zajmowały wtedy 94 MB).
Po padnięciu serwera zostaje też blokada (`server.lock.lock`), przez którą
kolejny start kończy się „Lock file is already being held". Oba przypadki
rozwiązuje `npm run db:clean`.

Pula połączeń w `lib/prisma.ts` ma krótki `idleTimeoutMillis` — lokalna baza
zamyka bezczynne połączenia po swojej stronie, a bez tego pula podawałaby
martwe i sypała `P1017`.
