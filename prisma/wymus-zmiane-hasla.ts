// Wymuszenie zmiany hasła przy najbliższym logowaniu.
//
//   npx tsx prisma/wymus-zmiane-hasla.ts --email dpilc@wp.pl                    <- dev, podgląd
//   npx tsx prisma/wymus-zmiane-hasla.ts --email dpilc@wp.pl --ustaw            <- dev, wykonanie
//   npx tsx prisma/wymus-zmiane-hasla.ts --env .env.vercel --email dpilc@wp.pl --ustaw
//
// Po co osobny skrypt: hasla-trenerow.ts obejmuje wyłącznie rolę TRAINER, więc
// konto właściciela (ADMIN) zostawało z hasłem tymczasowym z czasów zakładania
// klubu. Tego samego narzędzia użyje się przy każdym koncie, któremu klub nadał
// hasło "na chwilę".
//
// Flaga User.mustChangePassword jest sprawdzana w strażniku sesji: dopóki jest
// zapalona, konto wchodzi wyłącznie na /zmiana-hasla, a wpisanie z powrotem
// starego hasła jest odrzucane (lib/auth/guard.ts, app/zmiana-hasla).
//
// UWAGA: sama flaga nie unieważnia starego hasła. Jeśli hasło zna ktoś poza
// właścicielem konta, trzeba je najpierw wymienić - flaga tylko wymusi
// ustawienie nowego przy pierwszym wejściu.

import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickConnectionString } from "../lib/domain/connection-string";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const envFile = arg("--env") ?? ".env";
const email = arg("--email");
const wykonaj = process.argv.includes("--ustaw");

if (!existsSync(envFile)) {
  console.error(`Nie znaleziono pliku z adresem bazy: ${envFile}`);
  process.exit(1);
}
if (!email) {
  console.error("Podaj konto: --email <adres>");
  process.exit(1);
}
dotenv.config({ path: envFile, override: true, quiet: true });

const connectionString = pickConnectionString(process.env);
if (!connectionString) {
  console.error(`W pliku ${envFile} nie ma adresu bazy (DATABASE_URL).`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log(`Baza: ${connectionString!.replace(/:\/\/[^@]*@/, "://***@")} (z ${envFile})\n`);

  const konto = await prisma.user.findUnique({
    where: { email: email!.toLowerCase() },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
  });

  if (!konto) {
    console.error(`Nie ma konta o adresie ${email}.`);
    process.exitCode = 1;
    return;
  }

  // Konto kiosku celowo pomijamy: hasło zna cała sala, a wymuszona zmiana
  // zablokowałaby tablet na ekranie zmiany hasła (patrz AGENTS.md, "Kiosk").
  if (konto.role === "KIOSK") {
    console.error("To konto kiosku - wymuszona zmiana hasła zablokowałaby tablet na sali.");
    process.exitCode = 1;
    return;
  }

  console.log(`${konto.role}  ${konto.email}  (${konto.name})`);
  console.log(`  teraz: ${konto.mustChangePassword ? "wymusza zmianę" : "bez wymuszenia"}`);

  if (konto.mustChangePassword) {
    console.log("\nNic do zrobienia - to konto już musi zmienić hasło przy logowaniu.");
    return;
  }

  if (!wykonaj) {
    console.log("\nPodgląd. Dodaj --ustaw, żeby zapalić wymuszenie zmiany hasła.");
    return;
  }

  await prisma.user.update({ where: { id: konto.id }, data: { mustChangePassword: true } });
  console.log("\nGotowe: przy najbliższym logowaniu konto ustawi nowe hasło.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
