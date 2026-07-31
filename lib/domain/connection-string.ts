// Wybór adresu połączenia z bazą.
//
// Sterownik node-postgres (@prisma/adapter-pg) łączy się wyłącznie adresem
// `postgresql://`. Hosting podstawia natomiast kilka zmiennych naraz:
// integracja Prisma Postgres na Vercelu tworzy DATABASE_URL, DATABASE_POSTGRES_URL
// oraz DATABASE_PRISMA_DATABASE_URL, i pod DATABASE_URL potrafi wstawić adres
// `prisma+postgres://` (połączenie przez Accelerate), którego ten sterownik nie
// przetworzy.
//
// Dlatego nie ufamy jednej nazwie, tylko bierzemy pierwszy adres w formacie,
// który sterownik rozumie.

/** Kolejność ma znaczenie: własna konfiguracja przed tą od hostingu. */
export const CONNECTION_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_POSTGRES_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
] as const;

export function isDirectPostgresUrl(url: string | undefined): boolean {
  return url != null && (url.startsWith("postgresql://") || url.startsWith("postgres://"));
}

// Sterownik pg traktuje dziś `sslmode=require` jak `verify-full`, czyli
// sprawdza certyfikat serwera. W przyszłej wersji (pg 9) `require` przyjmie
// znaczenie z libpq: szyfruj, ale certyfikatu NIE sprawdzaj. Aktualizacja
// biblioteki po cichu osłabiłaby więc połączenie z bazą klubu.
//
// Zapisujemy zamiar wprost, zamiast polegać na domyślnym zachowaniu. Dziś nic
// to nie zmienia (to samo sprawdzanie co teraz), a po aktualizacji pg
// połączenie zostanie tak samo ścisłe. Adres pochodzi z integracji hostingu,
// więc poprawiamy go tutaj - ręczna zmiana w panelu byłaby nadpisywana.
export function hardenSslMode(url: string): string {
  if (!url.includes("sslmode=require")) return url;
  return url.replace("sslmode=require", "sslmode=verify-full");
}

export function pickConnectionString(env: Record<string, string | undefined>): string {
  for (const key of CONNECTION_ENV_KEYS) {
    if (isDirectPostgresUrl(env[key])) return hardenSslMode(env[key]!);
  }

  // Nic pasującego - oddajemy DATABASE_URL, żeby ewentualny błąd wskazał na
  // konfigurację, zamiast ginąć w pustym stringu.
  return env.DATABASE_URL ?? "";
}
