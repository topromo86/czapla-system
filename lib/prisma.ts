import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import { pickConnectionString } from "@/lib/domain/connection-string";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  // Baza stoi na serwerze i sama zamyka bezczynne połączenia. Domyślna pula pg
  // trzymałaby je bez końca i podała potem martwe -> błąd P1017 "Server has
  // closed the connection" na ekranach robiących wiele zapytań naraz. Krótki
  // idleTimeoutMillis sprawia, że pula sama zamyka bezczynne, zanim zrobi to
  // serwer, i otwiera świeże na żądanie.
  const adapter = new PrismaPg({
    connectionString: pickConnectionString(process.env),
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
