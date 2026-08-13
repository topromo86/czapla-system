// Nowe hasła dla kadry trenerskiej.
//
//   npx tsx prisma/hasla-trenerow.ts                       <- dev, tylko podgląd
//   npx tsx prisma/hasla-trenerow.ts --ustaw               <- dev, wykonanie
//   npx tsx prisma/hasla-trenerow.ts --env .env.vercel --ustaw
//
// Powód: konta kadry powstały ze wspólnym hasłem tymczasowym wpisanym w
// skrypcie zakładającym trenerów. Jedno hasło do wszystkich kont, znane
// każdemu, kto zajrzy do repozytorium, otwiera kartotekę klientów klubu.
//
// Hasła NIE trafiają na ekran ani do repozytorium - lądują w pliku obok
// projektu, wykluczonym z gita. Rozdaje się je osobiście, a plik kasuje.
// Wypisanie ich w konsoli zostawiłoby je w historii terminala.

import { existsSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickConnectionString } from "../lib/domain/connection-string";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const envFile = arg("--env") ?? ".env";
const wykonaj = process.argv.includes("--ustaw");

if (!existsSync(envFile)) {
  console.error(`Nie znaleziono pliku z adresem bazy: ${envFile}`);
  process.exit(1);
}
dotenv.config({ path: envFile, override: true, quiet: true });

const connectionString = pickConnectionString(process.env);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Bez znaków, które mylą się przy dyktowaniu przez telefon: 0/O, 1/l/I, 5/S.
// Hasło ma być podane głosem w szatni, a nie przepisane z ekranu.
const ALPHABET = "abcdefghjkmnpqrtuvwxyz23467989";

function generatePassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  // Trzy grupy po cztery znaki: 12 znaków z 30-znakowego alfabetu to ~59 bitów
  // entropii, a myślniki robią z tego coś, co da się podyktować.
  return `${group()}-${group()}-${group()}`;
}

async function main() {
  console.log(`Baza: ${connectionString.replace(/:\/\/[^@]*@/, "://***@")} (z ${envFile})\n`);

  const trenerzy = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: { id: true, email: true, name: true, lastLoginAt: true },
    orderBy: { name: "asc" },
  });

  if (trenerzy.length === 0) {
    console.log("Brak kont z rolą TRAINER.");
    return;
  }

  console.log(`Konta instruktorów (${trenerzy.length}):`);
  for (const t of trenerzy) {
    const logowanie = t.lastLoginAt
      ? `ostatnie logowanie ${t.lastLoginAt.toISOString().slice(0, 10)}`
      : "nigdy się nie logował(a)";
    console.log(`  ${t.email.padEnd(36)} ${t.name.padEnd(24)} ${logowanie}`);
  }

  if (!wykonaj) {
    console.log("\nTo była próba na sucho - żadne hasło nie zostało zmienione.");
    console.log("Uruchom z --ustaw, żeby wygenerować nowe hasła.");
    return;
  }

  const wiersze: string[] = [
    "HASŁA INSTRUKTORÓW - Czapla Boxing",
    `Wygenerowane: ${new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}`,
    "",
    "Rozdaj osobiście, potem skasuj ten plik.",
    "",
  ];

  for (const t of trenerzy) {
    const haslo = generatePassword();
    await prisma.user.update({
      where: { id: t.id },
      data: { passwordHash: await bcrypt.hash(haslo, 10) },
    });
    wiersze.push(`${t.name}`);
    wiersze.push(`  login:  ${t.email}`);
    wiersze.push(`  hasło:  ${haslo}`);
    wiersze.push("");
  }

  const nazwa = `hasla-instruktorow-${new Date().toISOString().slice(0, 10)}.txt`;
  writeFileSync(nazwa, wiersze.join("\n"), "utf8");

  console.log(`\nZmieniono hasła: ${trenerzy.length}.`);
  console.log(`Lista zapisana w pliku: ${nazwa}`);
  console.log("Plik jest wykluczony z gita. Rozdaj hasła i skasuj go.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
