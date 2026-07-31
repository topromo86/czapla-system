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

export function pickConnectionString(env: Record<string, string | undefined>): string {
  for (const key of CONNECTION_ENV_KEYS) {
    if (isDirectPostgresUrl(env[key])) return env[key]!;
  }

  // Nic pasującego - oddajemy DATABASE_URL, żeby ewentualny błąd wskazał na
  // konfigurację, zamiast ginąć w pustym stringu.
  return env.DATABASE_URL ?? "";
}
