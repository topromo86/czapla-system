// Konto tabletu na sali (rola KIOSK).
//
//   npx tsx prisma/kiosk-account.ts --haslo <haslo>
//   npx tsx prisma/kiosk-account.ts --env .env.vercel --haslo <haslo>
//
// Hasło podaje się w wywołaniu, a nie w kodzie: to konto loguje każdy, kto
// odpala tablet, więc hasło i tak nie jest sekretem - ale nie ma powodu, żeby
// leżało w repozytorium na zawsze.
//
// Konto widzi WYŁĄCZNIE kiosk: ekran z kodem zajęć i skaner. Żadnej kartoteki,
// pieniędzy ani grafiku - stąd osobna rola, a nie "trener techniczny".
// Uruchomienie drugi raz zmienia hasło, nie tworzy duplikatu.

import { existsSync } from "node:fs";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickConnectionString } from "../lib/domain/connection-string";

const LOGIN = "kiosk";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const envFile = arg("--env") ?? ".env";
if (!existsSync(envFile)) {
  console.error(`Nie znaleziono pliku z adresem bazy: ${envFile}`);
  process.exit(1);
}
dotenv.config({ path: envFile, override: true, quiet: true });

const haslo = arg("--haslo");
if (!haslo || haslo.length < 6) {
  console.error("Podaj hasło: --haslo <co najmniej 6 znaków>");
  process.exit(1);
}

const connectionString = pickConnectionString(process.env);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log(`Baza: ${connectionString.replace(/:\/\/[^@]*@/, "://***@")} (z ${envFile})`);

  const passwordHash = await bcrypt.hash(haslo!, 10);
  const konto = await prisma.user.upsert({
    where: { email: LOGIN },
    update: { passwordHash, role: "KIOSK", name: "Kiosk (tablet na sali)" },
    create: { email: LOGIN, passwordHash, role: "KIOSK", name: "Kiosk (tablet na sali)" },
  });

  console.log(`Gotowe. Login: ${konto.email} · rola: ${konto.role}`);
  console.log("Po zalogowaniu tablet trafia prosto na /kod-zajec i nie widzi nic poza kioskiem.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
