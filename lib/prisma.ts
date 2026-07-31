import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  // Lokalny `prisma dev` (PGlite) zamyka bezczynne połączenia po swojej stronie.
  // Domyślna pula pg trzymałaby je bez końca i podała potem martwe -> błąd
  // P1017 "Server has closed the connection". Krótki idleTimeoutMillis sprawia,
  // że pula sama zamyka bezczynne, zanim serwer je ubije, i otwiera świeże na
  // żądanie - dzięki temu strona nie pada losowo przy równoległych zapytaniach.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
