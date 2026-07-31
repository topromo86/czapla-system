// Konfiguracja klubu Czapla Boxing: konto superadmina, kategorie zajęć i pełny
// grafik tygodniowy (stan na 31.07.2026).
//
// Skrypt jest IDEMPOTENTNY - można go puścić na pełnej bazie i nic nie zdubluje.
// Razem z `prisma/add-real-trainers.ts` odtwarza cały stan klubu po awarii:
//
//   npm run db:setup
//
// Trenerów dodaje add-real-trainers.ts (tam są ich opisy ze strony klubu), więc
// TEN skrypt zakłada, że kadra już istnieje - inaczej przerywa z czytelnym
// błędem zamiast tworzyć zajęcia bez prowadzącego.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { generateSessions } from "../lib/jobs/generate-sessions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEV_PASSWORD = "test1234"; // hasło tymczasowe - do zmiany przed produkcją

// Superadmin (konto wsparcia/vendora). System nie ma osobnego tieru - to zwykły
// ADMIN, a jego akcje i tak są widoczne w /admin/aktywnosc.
const SUPERADMIN = {
  email: "marcin.belak@gmail.com",
  name: "Marcin Bełak (superadmin)",
};

// Kategorie, po których klienci filtrują planner. Nazwy muszą zgadzać się z
// polem `cat` w grafiku niżej.
const CATEGORIES = ["Kids Boxing", "Boks Junior", "Women Boxing", "Gentleman Boxing"];

// Grafik tygodniowy. weekday: 1=Pon 2=Wt 3=Śr 4=Czw 5=Pt.
// Zajęcia są cykliczne "do odwołania" - job generateSessions rozwija je na
// konkretne terminy (8 tygodni w przód).
//
// Zajęcia NIE mają własnej nazwy (name = null) - nazywają się tak jak ich
// rodzaj, więc na grafiku widać "Kids Boxing", a nie skrót "kids".
// Nazwę wylicza resolveClassName z rodzaju, dzięki czemu zmiana nazwy rodzaju
// przenosi się na zajęcia same z siebie.
type Tpl = { day: number; time: string; trainer: string; cat: string };

const CZAPLA = 'Daniel "Czapla" Pilc';

// Tychy: 60 min, 10 miejsc. Zajęcia "kids" prowadzi Jacek Targiel (w Mikołowie
// Jakub) - bracia zmieniają się między salami przez zastępstwa.
const TYCHY: Tpl[] = [
  { day: 1, time: "17:00", trainer: "Jacek Targiel", cat: "Kids Boxing" },
  { day: 1, time: "19:00", trainer: "Patryk Bortel", cat: "Gentleman Boxing" },
  { day: 2, time: "17:00", trainer: "Michał Kieca", cat: "Boks Junior" },
  { day: 2, time: "18:30", trainer: "Patryk Bortel", cat: "Women Boxing" },
  { day: 3, time: "17:00", trainer: "Jacek Targiel", cat: "Kids Boxing" },
  { day: 3, time: "19:00", trainer: "Patryk Bortel", cat: "Gentleman Boxing" },
  { day: 4, time: "17:00", trainer: "Michał Kieca", cat: "Boks Junior" },
  { day: 4, time: "18:30", trainer: "Patryk Bortel", cat: "Women Boxing" },
  { day: 5, time: "17:00", trainer: "Michał Kieca", cat: "Boks Junior" },
  { day: 5, time: "19:00", trainer: "Patryk Bortel", cat: "Gentleman Boxing" },
];

// Mikołów: 60 min, 20 miejsc. "Czapla" to zajęcia dla dorosłych prowadzone
// przez Daniela (w tym poranne 7:00 we wtorki i czwartki).
const MIKOLOW: Tpl[] = [
  { day: 1, time: "17:30", trainer: "Jakub Targiel", cat: "Kids Boxing" },
  { day: 1, time: "19:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 2, time: "07:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 2, time: "17:30", trainer: CZAPLA, cat: "Boks Junior" },
  { day: 2, time: "19:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 3, time: "17:30", trainer: "Jakub Targiel", cat: "Kids Boxing" },
  { day: 3, time: "19:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 4, time: "07:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 4, time: "17:30", trainer: CZAPLA, cat: "Boks Junior" },
  { day: 4, time: "19:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
  { day: 5, time: "17:00", trainer: CZAPLA, cat: "Boks Junior" },
  { day: 5, time: "19:00", trainer: CZAPLA, cat: "Gentleman Boxing" },
];

async function main() {
  // --- 1. Superadmin ------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: SUPERADMIN.email },
    update: { role: "ADMIN", name: SUPERADMIN.name },
    create: {
      email: SUPERADMIN.email,
      name: SUPERADMIN.name,
      role: "ADMIN",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  // --- 2. Kategorie zajęć -------------------------------------------------
  let newCategories = 0;
  for (const [index, name] of CATEGORIES.entries()) {
    const existing = await prisma.classCategory.findUnique({ where: { name } });
    if (!existing) {
      await prisma.classCategory.create({ data: { name, sortOrder: (index + 1) * 10 } });
      newCategories++;
    }
  }

  // --- 3. Grafik ----------------------------------------------------------
  const locations = await prisma.location.findMany();
  const tychy = locations.find((l) => l.name === "Tychy");
  const mikolow = locations.find((l) => l.name === "Mikołów");
  if (!tychy || !mikolow) {
    throw new Error('Brak lokalizacji "Tychy" / "Mikołów" - uruchom najpierw `prisma db seed`.');
  }

  const categories = new Map((await prisma.classCategory.findMany()).map((c) => [c.name, c]));
  const trainers = new Map(
    (await prisma.trainer.findMany({ include: { user: true } })).map((t) => [t.user.name, t]),
  );

  async function addTemplate(locationId: string, capacity: number, tpl: Tpl): Promise<boolean> {
    const trainer = trainers.get(tpl.trainer);
    if (!trainer) {
      throw new Error(
        `Brak trenera "${tpl.trainer}" - uruchom najpierw \`tsx prisma/add-real-trainers.ts\`.`,
      );
    }
    const category = categories.get(tpl.cat);
    if (!category) throw new Error(`Brak kategorii "${tpl.cat}".`);

    // Jedna sala + dzień + godzina = jedne zajęcia. To jest klucz idempotencji.
    const existing = await prisma.classTemplate.findFirst({
      where: { locationId, weekday: tpl.day, startTime: tpl.time, active: true },
    });
    if (existing) return false;

    await prisma.classTemplate.create({
      data: {
        locationId,
        trainerId: trainer.id,
        categoryId: category.id,
        // Bez własnej nazwy - zajęcia nazywają się jak ich rodzaj.
        name: null,
        weekday: tpl.day,
        startTime: tpl.time,
        durationMin: 60,
        capacity,
        isKids: false,
      },
    });
    return true;
  }

  let newTemplates = 0;
  for (const tpl of TYCHY) if (await addTemplate(tychy.id, 10, tpl)) newTemplates++;
  for (const tpl of MIKOLOW) if (await addTemplate(mikolow.id, 20, tpl)) newTemplates++;

  // Rozwiń plan na konkretne terminy - inaczej grafik byłby pusty do czasu
  // nocnego jobu.
  const generated = await generateSessions(prisma);

  const totals = {
    admini: await prisma.user.count({ where: { role: "ADMIN" } }),
    trenerzy: await prisma.trainer.count(),
    szablony: await prisma.classTemplate.count({ where: { active: true } }),
    sesje: await prisma.session.count(),
  };

  console.warn(
    `Konfiguracja klubu: nowe kategorie=${newCategories}, nowe zajecia=${newTemplates}/${TYCHY.length + MIKOLOW.length}, ` +
      `sesje przetworzone=${generated.sessionsUpserted}`,
  );
  console.warn("Stan: " + JSON.stringify(totals));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
