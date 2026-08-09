// Wgranie migracji przy wdrożeniu produkcyjnym.
//
// Wcześniej migracje odpalało się z laptopa po każdym wdrożeniu. Raz już się to
// zemściło: kod poszedł na Vercela przed migracją i aplikacja witała klub
// błędem "The table `public.ClubSettings` does not exist". Krok, o którym trzeba
// pamiętać, prędzej czy później zostanie pominięty - więc robi to build.
//
// Dwie rzeczy, których nie robi zwykłe `prisma migrate deploy` w skrypcie:
//
// 1. Uruchamia się TYLKO przy wdrożeniu produkcyjnym (VERCEL_ENV=production).
//    Podglądy (preview) i buildy lokalne mają zostawić bazę w spokoju - inaczej
//    byle gałąź robocza zmieniałaby schemat klubu.
// 2. Wybiera adres tak samo jak aplikacja (lib/domain/connection-string.ts).
//    Integracja Prisma Postgres potrafi wstawić pod DATABASE_URL adres przez
//    Accelerate (`prisma+postgres://`), którym migracji się nie wgra.

import { spawnSync } from "node:child_process";
import { isDirectPostgresUrl, pickConnectionString } from "../lib/domain/connection-string";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv && vercelEnv !== "production") {
  console.log(`[migracje] Wdrożenie "${vercelEnv}" - pomijam, baza zostaje nietknięta.`);
  process.exit(0);
}

if (!vercelEnv) {
  console.log("[migracje] Build lokalny - pomijam. Migracje puszczaj świadomie.");
  process.exit(0);
}

const url = pickConnectionString(process.env);

if (!isDirectPostgresUrl(url)) {
  console.error(
    "[migracje] Brak bezpośredniego adresu postgresql:// w zmiennych środowiskowych. " +
      "Sprawdź DATABASE_URL / DATABASE_POSTGRES_URL w ustawieniach projektu.",
  );
  process.exit(1);
}

console.log("[migracje] Wdrożenie produkcyjne - wgrywam oczekujące migracje.");

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: url },
});

// Nieudana migracja ma wywrócić build. Aplikacja z nowym kodem na starym
// schemacie jest gorsza niż wdrożenie, które się nie udało.
process.exit(result.status ?? 1);
