<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Baza danych — zawsze na serwerze

**Nie ma bazy lokalnej i nie wolno jej zakładać.** Wszystko żyje w chmurze:

| Baza | Do czego | Kto jej dotyka |
| --- | --- | --- |
| **produkcyjna** | prawdziwi klienci, karnety, płatności, grafik | aplikacja na Vercelu |
| **deweloperska** | praca nad kodem, migracje, testy na danych | `npm run dev` u programisty |

Obie stoją u tego samego dostawcy (Prisma Postgres). Praca lokalna łączy się
z **deweloperską** — nigdy z produkcyjną. Adresy są w `.env` (poza repo).

Uruchomienie aplikacji to jedno polecenie, bez osobnego okna na bazę:

```
npm run dev
```

## Dlaczego nie ma bazy lokalnej

Wcześniej projekt używał `prisma dev` (lokalny Postgres w WASM). Skończyło się
to uszkodzeniem katalogu danych i odtwarzaniem klubu od zera. Powody były dwa
i oba wracały:

- silnik prowadził obok danych strumień zdarzeń, który urósł do 9,7 GB
  (przy 94 MB realnych danych) i wywracał bazę przy starcie,
- twarde ubicie procesu w trakcie zapisu psuło pliki nieodwracalnie
  (`Aborted()` z `@electric-sql/pglite`).

Do tego każdy programista miał własną kopię danych, więc „u mnie działa"
znaczyło co innego u każdego. Jedna baza na serwerze usuwa wszystkie te
problemy naraz.

## Migracje na produkcji

Wgrywa je **build na Vercelu**, nie człowiek z laptopa. Odpowiada za to
`scripts/deploy-migrations.ts` wpięty w `npm run build`:

- rusza wyłącznie przy wdrożeniu produkcyjnym (`VERCEL_ENV=production`) —
  podglądy i buildy lokalne nie dotykają bazy,
- adres wybiera tak samo jak aplikacja (`pickConnectionString`), bo pod
  `DATABASE_URL` potrafi siedzieć adres przez Accelerate,
- nieudana migracja wywraca build: nowy kod na starym schemacie jest gorszy
  niż wdrożenie, które się nie udało.

Powód jest z doświadczenia: kod raz poszedł na produkcję przed migracją i klub
zobaczył „The table `public.ClubSettings` does not exist". Krok, o którym
trzeba pamiętać, prędzej czy później zostanie pominięty.

## Odtworzenie stanu klubu

Cały stan klubu jest w skryptach — nic nie trzeba odtwarzać z pamięci:

```
npx prisma migrate deploy   # schemat
npx prisma db seed          # konfiguracja: lokalizacje, plany, zgody (+ dane testowe)
npm run db:setup            # kadra, superadmin, kategorie i grafik 22 zajęć
```

`db:setup` jest idempotentny — można go puszczać na pełnej bazie, nic nie
zdubluje. Odtwarza: 6 realnych trenerów (Daniel jako ADMIN z rekordem trenera,
czyli z przełącznikiem Admin/Trener), konto superadmina, kategorie zajęć oraz
grafik tygodniowy Tychy + Mikołów wraz z terminami na 8 tygodni.

**Uruchamiaj to wyłącznie na bazie deweloperskiej.** `db seed` dokłada dane
testowe (klienci, historia), więc na produkcji zaśmieciłby kartotekę klubu.

## Kopie zapasowe

Kopie bazy produkcyjnej trafiają na zewnętrzny serwer (Unixstorm) — poza
dostawcę bazy, żeby awaria po jego stronie nie zabrała ze sobą kopii.

## Wybór adresu połączenia

`lib/domain/connection-string.ts` wybiera pierwszy adres w formacie
`postgresql://`, bo hosting podstawia kilka zmiennych naraz i pod
`DATABASE_URL` potrafi wstawić adres przez Accelerate (`prisma+postgres://`),
którego sterownik `node-postgres` nie otworzy. Tam też jest jawne
`sslmode=verify-full`, żeby aktualizacja `pg` nie wyłączyła po cichu
sprawdzania certyfikatu.

## Cennik karnetów

Rodzaje karnetów żyją w `prisma/club-plans.ts` - jedno miejsce, z którego
korzysta seed i skrypt wymiany cennika. Wcześniej seed miał własne, wymyślone
ceny i wracały one na każdą odtworzoną bazę.

Wymiana cennika wraz z wyczyszczeniem demonstracyjnej historii karnetów:

```
npx tsx prisma/reset-cennik.ts                        # dev, tylko podgląd
npx tsx prisma/reset-cennik.ts --usun                 # dev, wykonanie
npx tsx prisma/reset-cennik.ts --env .env.vercel      # produkcja, podgląd
npx tsx prisma/reset-cennik.ts --env .env.vercel --usun
```

Skrypt kasuje karnety, wpłaty i cennik; nie rusza klientów, zajęć, grafiku,
kont ani zamknięć kasy. Bez `--usun` nic nie robi - kasowanie `Payment`
(w normalnej pracy append-only) jest nieodwracalne.

Codzienne zmiany cen robi właściciel na ekranie **Pieniądze → Rodzaje
karnetów**, bez programisty.

## Kiosk na sali

Tablet ma własne konto (rola `KIOSK`, login `kiosk`). Po zalogowaniu widzi
wyłącznie `/kod-zajec`: kod QR najbliższych zajęć dla klubowiczów i skaner
kodów rotacyjnych dla prowadzącego. Nie widzi kartoteki, pieniędzy ani grafiku -
hasło do tego konta zna cały klub, więc uprawnienia muszą być zerowe. Dlatego
osobna rola, a nie "trener techniczny".

Założenie/zmiana hasła konta kiosku (hasło w wywołaniu, nie w repozytorium):

```
npx tsx prisma/kiosk-account.ts --haslo <haslo>
npx tsx prisma/kiosk-account.ts --env .env.vercel --haslo <haslo>
```

Kamera działa tylko po HTTPS - na Vercelu tak, na tablecie wpiętym po adresie
IP w sieci lokalnej nie. Dekodowanie ma dwie drogi: natywny `BarcodeDetector`
(Chrome/Android) i `jsQR` dla Safari na iPadzie.

## Hasła kadry

Konta trenerów powstały ze wspólnym hasłem tymczasowym wpisanym w skrypcie
zakładającym kadrę. Jedno hasło do wszystkich kont, widoczne dla każdego, kto
zajrzy do repozytorium, otwiera kartotekę klientów - dlatego przed oddaniem
systemu klubowi trzeba je wymienić:

```
npx tsx prisma/hasla-trenerow.ts                        # podgląd listy kont
npx tsx prisma/hasla-trenerow.ts --ustaw                # dev, nowe hasła
npx tsx prisma/hasla-trenerow.ts --env .env.vercel --ustaw
```

Hasła nie trafiają na ekran ani do repozytorium - lądują w pliku
`hasla-instruktorow-<data>.txt` obok projektu (wykluczonym z gita).
Rozdaje się je osobiście, potem plik się kasuje. Wypisanie ich w konsoli
zostawiłoby je w historii terminala.
