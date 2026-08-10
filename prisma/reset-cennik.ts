// Wymiana cennika: kasuje demonstracyjną historię karnetów i wgrywa realne
// rodzaje karnetów klubu (prisma/club-plans.ts).
//
// Baza deweloperska (domyślnie .env):
//   npx tsx prisma/reset-cennik.ts            <- tylko pokazuje, co zniknie
//   npx tsx prisma/reset-cennik.ts --usun     <- naprawdę kasuje i wgrywa
//
// Inna baza (np. produkcyjna) - wskaż plik z adresem, skrypt sam go wczyta:
//   npx tsx prisma/reset-cennik.ts --env .env.vercel
//   npx tsx prisma/reset-cennik.ts --env .env.vercel --usun
//
// Na Windows/PowerShell: npx.cmd zamiast npx (polityka wykonywania blokuje
// npx.ps1). Adres bazy wczytuje skrypt, więc hasło nie przechodzi przez wiersz
// poleceń ani przez historię terminala.
//
// Kasowanie jest nieodwracalne, więc domyślnie skrypt NIC nie robi - najpierw
// wypisuje, co ma zniknąć, i dopiero druga świadoma decyzja to wykonuje.
// Payment jest w tym systemie append-only (korekta = nowy wpis), więc jego
// czyszczenie może się odbyć wyłącznie tędy, jednorazowo, przy starcie klubu.
//
// Czego NIE rusza: klientów, zajęć, grafiku, kont, zamknięć kasy. Tylko
// karnety, wpłaty za nie i sam cennik.

import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pickConnectionString } from "../lib/domain/connection-string";
import { entriesLabel } from "../lib/domain/plan";
import { CLUB_PLANS } from "./club-plans";

const wykonaj = process.argv.includes("--usun");

// --env <plik>. Bez tego bierzemy .env, czyli bazę deweloperską - żeby
// "uruchomiłem bez parametrów" nigdy nie znaczyło "uderzyłem w produkcję".
const envIndex = process.argv.indexOf("--env");
const envFile = envIndex >= 0 ? process.argv[envIndex + 1] : ".env";

if (!envFile || !existsSync(envFile)) {
  console.error(`Nie znaleziono pliku z adresem bazy: ${envFile}`);
  process.exit(1);
}
dotenv.config({ path: envFile, override: true, quiet: true });

const connectionString = pickConnectionString(process.env);
if (!connectionString) {
  console.error(`W pliku ${envFile} nie ma adresu bazy (DATABASE_URL).`);
  process.exit(1);
}

// Host bez hasła - potwierdzenie, w co uderzamy, bez pokazywania sekretu.
console.log(`Baza: ${connectionString.replace(/:\/\/[^@]*@/, "://***@")} (z ${envFile})\n`);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function zl(grosze: number): string {
  return (grosze / 100).toFixed(2).replace(/\.00$/, "");
}

async function main() {
  const [passes, payments, redemptions, charged, plans] = await Promise.all([
    prisma.pass.count(),
    prisma.payment.count(),
    prisma.giftCardRedemption.count(),
    prisma.booking.count({ where: { chargedPassId: { not: null } } }),
    prisma.plan.findMany({ include: { _count: { select: { passes: true } } } }),
  ]);

  console.log("Do skasowania:");
  console.log(`  karnety (Pass):            ${passes}`);
  console.log(`  wpłaty (Payment):          ${payments}`);
  console.log(`  wykorzystania kart podar.: ${redemptions}`);
  console.log(`  zapisy z pobranym wejściem: ${charged} (czyścimy samo powiązanie)`);
  console.log(`  rodzaje karnetów:          ${plans.length}`);
  for (const p of plans) {
    console.log(`    - ${p.name} (${zl(p.priceGross)} zł, sprzedany ${p._count.passes}×)`);
  }

  console.log("\nDo wgrania:");
  for (const p of CLUB_PLANS) {
    const wejscia = entriesLabel(p.entriesPerMonth);
    console.log(
      `  + ${p.name} - ${zl(p.priceGross)} zł, ${wejscia}, ${p.durationDays} dni${p.forMinors ? ", dzieci" : ""}`,
    );
  }

  if (!wykonaj) {
    console.log("\nTo była próba na sucho. Uruchom z --usun, żeby wykonać.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Kolejność wymuszona przez klucze obce: najpierw to, co wskazuje na
    // karnet i wpłatę, potem one same, na końcu cennik.
    await tx.booking.updateMany({
      where: { chargedPassId: { not: null } },
      data: { chargedPassId: null, entryRefundedAt: null, entryRefundedByUserId: null },
    });
    await tx.giftCardRedemption.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.pass.deleteMany({});
    await tx.plan.deleteMany({});

    for (const plan of CLUB_PLANS) {
      await tx.plan.create({ data: plan });
    }
  });

  const [poPass, poPayment, poPlan] = await Promise.all([
    prisma.pass.count(),
    prisma.payment.count(),
    prisma.plan.findMany({ orderBy: [{ forMinors: "asc" }, { priceGross: "desc" }] }),
  ]);
  console.log(`\nGotowe. Karnety=${poPass}, wpłaty=${poPayment}, cennik=${poPlan.length} pozycji:`);
  for (const p of poPlan) {
    console.log(`  ${p.name} - ${zl(p.priceGross)} zł`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
