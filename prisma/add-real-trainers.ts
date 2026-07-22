// Import prawdziwej kadry trenerskiej ze strony klubu
// (https://czaplaboxing.pl/nasza-kadra-trenerska/, stan na 2026-07).
//
// Skrypt jest idempotentny i można go uruchomić po każdym `prisma db seed`:
//   npx tsx prisma/add-real-trainers.ts
//
// 1. Do WSZYSTKICH dotychczasowych (testowych) trenerów dopisuje " TESTOWY",
//    żeby odróżnić ich od realnej kadry, ale ich nie usuwa (zostaje historia).
// 2. Dodaje realnych trenerów z opisami. Konto logowania dostaje hasło
//    tymczasowe (DEV_PASSWORD) - ZMIENIĆ przed produkcją. Bez zdjęć (dograć
//    osobno). Lokalizacja domyślna: Mikołów (główny adres z witryny) - admin
//    może przypisać Tychy na karcie trenera.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = "test1234"; // hasło tymczasowe - do zmiany przed produkcją
const TESTOWY_SUFFIX = " TESTOWY";

type RealTrainer = { name: string; email: string; bio: string };

const REAL_TRAINERS: RealTrainer[] = [
  {
    name: 'Daniel "Czapla" Pilc',
    email: "dpilc@wp.pl",
    bio: "Certified Personal Trainer. Trener boksu klasy drugiej, były zawodowy pięściarz i szkoleniowiec mistrzów Polski. W naszym klubie stawiamy na prawdziwy boks: ciężką pracę, charakter i dyscyplinę. Tu nie ma ściemy ani gadania o formie - jest pot, ring i konkretne wyniki. Trenujemy ludzi, którzy chcą być lepsi niż wczoraj, niezależnie czy zaczynasz od zera, czy celujesz w mistrzostwo.\n\nSpecjalizacje: Personal Boxing, Trening motoryczny.",
  },
  {
    name: "Michał Kieca",
    email: "michal.kieca@czaplaboxing.pl",
    bio: "Certified Personal Trainer. Trener boksu związany ze sportami walki od 17. roku życia. Drogę sportową rozpoczął od zapasów w stylu wolnym, budując fundamenty motoryczne, koordynacyjne i mentalne. W 2013 roku uzyskał tytuł instruktora zapasów, równolegle rozwijając kompetencje bokserskie pod okiem Daniela Pilca. W 2023 roku zdobył tytuł Trenera Boksu Klasy II (certyfikat PZB).\n\nWspółpracuje z kadrą wojewódzką Mazowsza, uczestnicząc w obozach szkoleniowych z multimedalistkami Mistrzostw Polski i Europy. Szkoli się pod okiem trenerów klasy mistrzowskiej. W pracy stawia na rzetelne podstawy techniczne, szybkość i precyzję oraz bezpieczne budowanie formy. Szczególną satysfakcję czerpie z pracy z młodzieżą.\n\nSpecjalizacje: Trening boksu, Trening siłowy.",
  },
  {
    name: "Jacek Targiel",
    email: "jacek.targiel@czaplaboxing.pl",
    bio: "Certified Personal Trainer. Utytułowany bokser, trenujący od 10. roku życia pod okiem Ryszarda Dziopy i Daniela Pilca. Ma na koncie ponad 70 walk olimpijskich, jest Mistrzem Polski, dwukrotnym brązowym medalistą Mistrzostw Polski oraz pięciokrotnym Mistrzem Śląska. Certyfikowany instruktor boksu, łączący doświadczenie zawodnicze z pracą szkoleniową.\n\nSpecjalizacje: Treningi bokserskie.",
  },
  {
    name: "Bartłomiej Przybyła",
    email: "bartlomiej.przybyla@czaplaboxing.pl",
    bio: "Certified Personal Trainer. Treningi bokserskie prowadzi od 2020 roku, boks trenuje nieprzerwanie od 13 lat. Siedmiokrotny medalista Mistrzostw Polski, zawodowy Mistrz Polski, rekord zawodowy 10-2 (3 KO), ponad 130 walk w boksie olimpijskim. Oferuje naukę boksu od podstaw, poprawę sylwetki, kondycji i koordynacji. Pracuje z osobami na każdym poziomie - od początkujących po zawodników przygotowujących się do startów.\n\nSpecjalizacje: Treningi bokserskie.",
  },
  {
    name: "Patryk Bortel",
    email: "patryk.bortel@czaplaboxing.pl",
    bio: "Certified Personal Trainer. Certyfikowany instruktor boksu Polskiego Związku Bokserskiego, na co dzień trenuje pod okiem Daniela Pilca. Ma doświadczenie w pracy zarówno z zawodowymi pięściarzami, jak i z osobami stawiającymi pierwsze kroki. Zaprasza wszystkich, niezależnie od poziomu zaawansowania - nauczysz się podstaw, doszkolisz technikę i zrobisz dobry trening.\n\nSpecjalizacje: Cardio, Podstawy boksu.",
  },
  {
    name: "Jakub Targiel",
    email: "jakub.targiel@czaplaboxing.pl",
    bio: "Certified Personal Trainer. Utytułowany pięściarz boksu olimpijskiego. Od 10. roku życia trenuje pod okiem Ryszarda Dziopy i Daniela Pilca. Ma na koncie ponad 70 walk, jest dwukrotnym Mistrzem Polski, zdobywcą dwóch brązowych medali Mistrzostw Polski oraz pięciu złotych medali Mistrzostw Śląska. Certyfikowany instruktor boksu.\n\nSpecjalizacje: Treningi bokserskie, Treningi indywidualne.",
  },
];

async function main() {
  const realEmails = new Set(REAL_TRAINERS.map((t) => t.email));

  // 1. Oznacz istniejących (testowych) trenerów dopiskiem TESTOWY. Pomijamy
  //    realnych (gdyby skrypt był uruchamiany ponownie) i już oznaczonych.
  const existing = await prisma.trainer.findMany({ include: { user: true } });
  let renamed = 0;
  for (const t of existing) {
    if (realEmails.has(t.user.email)) continue;
    if (t.user.name.endsWith(TESTOWY_SUFFIX)) continue;
    await prisma.user.update({
      where: { id: t.userId },
      data: { name: `${t.user.name}${TESTOWY_SUFFIX}` },
    });
    renamed++;
  }

  // 2. Lokalizacja domyślna - Mikołów.
  const mikolow = await prisma.location.findFirst({ where: { name: "Mikołów" } });
  if (!mikolow) throw new Error('Brak lokalizacji "Mikołów" - uruchom najpierw seed.');

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  let created = 0;
  let updated = 0;
  for (const rt of REAL_TRAINERS) {
    const existingUser = await prisma.user.findUnique({
      where: { email: rt.email },
      include: { trainer: true },
    });

    if (existingUser?.trainer) {
      // Już jest - odświeżamy tylko opis i nazwę (bez ruszania hasła/lokalizacji).
      await prisma.user.update({ where: { id: existingUser.id }, data: { name: rt.name } });
      await prisma.trainer.update({ where: { id: existingUser.trainer.id }, data: { bio: rt.bio } });
      updated++;
      continue;
    }

    await prisma.user.create({
      data: {
        email: rt.email,
        name: rt.name,
        role: "TRAINER",
        passwordHash,
        trainer: {
          create: { locationId: mikolow.id, hiredAt: new Date(), bio: rt.bio },
        },
      },
    });
    created++;
  }

  console.log(
    `Trenerzy: oznaczono TESTOWY=${renamed}, dodano realnych=${created}, zaktualizowano=${updated}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
