// Seed deterministyczny - SPEC.md sekcja 5.
// Odtwarza sytuację wyjściową klubu: 2 lokalizacje, 4 trenerów o różnej jakości pracy,
// ~38 dorosłych + ~14 dzieci rozłożonych na 11 miesięcy wstecz, luki w danych (brak celu,
// brak notatek, obecność 7-20 dni temu), kilka korekt płatności.
//
// RNG jest seedowany stałą liczbą (mulberry32) - te same dane za każdym uruchomieniem.
// Daty są liczone względem chwili uruchomienia skryptu ("teraz"), więc wygląda zawsze
// aktualnie, ale wybory (kto odszedł, kto ma lukę, kto dostał jaki plan) są deterministyczne.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NOW = new Date();
const DEV_PASSWORD = "test1234";

// --- RNG deterministyczny -----------------------------------------------------------

const SEED = 20260101;
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const randFloat = (min: number, max: number, decimals = 1) => {
  const v = rng() * (max - min) + min;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function chance(p: number): boolean {
  return rng() < p;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function daysAgo(days: number): Date {
  return addDays(NOW, -days);
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// Bardzo przybliżona konwersja lokalnego czasu Warszawy na UTC (CEST kwiecień-październik).
// Wystarczające dla danych seedowych - właściwa logika stref czasu żyje w lib/domain (Faza 1).
function warsawDateTime(y: number, m: number, d: number, hh: number, mm: number): Date {
  const isSummer = m >= 4 && m <= 9;
  const offset = isSummer ? 2 : 1;
  return new Date(Date.UTC(y, m - 1, d, hh - offset, mm));
}

// --- Słowniki -------------------------------------------------------------------------

const CONSENT_TYPES = [
  { key: "reg", label: "Regulamin klubu", version: 1, required: true, forMinorsOnly: false },
  {
    key: "rodo",
    label: "Zgoda RODO na przetwarzanie danych",
    version: 1,
    required: true,
    forMinorsOnly: false,
  },
  {
    key: "health",
    label: "Deklaracja zdrowia",
    version: 1,
    required: true,
    forMinorsOnly: false,
  },
  {
    key: "image",
    label: "Zgoda na wykorzystanie wizerunku",
    version: 1,
    required: false,
    forMinorsOnly: false,
  },
  {
    key: "guardian",
    label: "Zgoda opiekuna prawnego",
    version: 1,
    required: true,
    forMinorsOnly: true,
  },
] as const;

const CHURN_REASONS = [
  { label: "Brak postępów", trainerControllable: true },
  { label: "Nie czułem się częścią grupy", trainerControllable: true },
  { label: "Brak partnera do sparingu", trainerControllable: true },
  { label: "Kontuzja", trainerControllable: false },
  { label: "Zmiana miejsca zamieszkania", trainerControllable: false },
  { label: "Cena", trainerControllable: false },
  { label: "Brak czasu", trainerControllable: false },
] as const;

const ADULT_FIRST_NAMES_M = [
  "Adam",
  "Marcin",
  "Piotr",
  "Krzysztof",
  "Tomasz",
  "Michał",
  "Paweł",
  "Łukasz",
  "Grzegorz",
  "Rafał",
  "Dawid",
  "Jakub",
  "Bartosz",
  "Wojciech",
  "Damian",
  "Kamil",
  "Sebastian",
  "Artur",
  "Mateusz",
  "Robert",
];
const ADULT_FIRST_NAMES_F = [
  "Anna",
  "Katarzyna",
  "Magdalena",
  "Agnieszka",
  "Ewa",
  "Joanna",
  "Monika",
  "Natalia",
  "Karolina",
  "Aleksandra",
  "Weronika",
  "Justyna",
  "Paulina",
  "Sylwia",
  "Dorota",
  "Beata",
  "Marta",
  "Iwona",
  "Klaudia",
  "Renata",
];
const KID_FIRST_NAMES_M = [
  "Antoni",
  "Franciszek",
  "Filip",
  "Wojtek",
  "Kacper",
  "Igor",
  "Szymon",
  "Miłosz",
];
const KID_FIRST_NAMES_F = ["Zuzia", "Hania", "Lena", "Maja", "Amelia", "Julia", "Oliwia", "Zosia"];
const LAST_NAMES = [
  "Nowak",
  "Kowalski",
  "Wiśniewski",
  "Wójcik",
  "Kowalczyk",
  "Kamiński",
  "Lewandowski",
  "Zieliński",
  "Szymański",
  "Woźniak",
  "Dąbrowski",
  "Kozłowski",
  "Jankowski",
  "Mazur",
  "Kwiatkowski",
  "Krawczyk",
  "Piotrowski",
  "Grabowski",
  "Nowakowski",
  "Pawłowski",
  "Michalski",
  "Adamczyk",
  "Dudek",
  "Zając",
  "Wieczorek",
  "Jabłoński",
  "Król",
  "Majewski",
  "Olszewski",
  "Stępień",
];

let lastNameCursor = 0;
function nextLastName(): string {
  const n = LAST_NAMES[lastNameCursor % LAST_NAMES.length];
  lastNameCursor++;
  return n;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ź|ż/g, "z");
}

async function main() {
  console.warn(`Seeduję dane dla "teraz" = ${NOW.toISOString()}...`);
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // --- Lokalizacje ----------------------------------------------------------------
  const mikolow = await prisma.location.create({
    data: { name: "Mikołów", address: "ul. Krakowska 12, 43-190 Mikołów" },
  });
  const tychy = await prisma.location.create({
    data: { name: "Tychy", address: "ul. Sportowa 5, 43-100 Tychy" },
  });
  const locations = [mikolow, tychy];

  // --- Słowniki referencyjne -------------------------------------------------------
  const consentTypes = new Map<string, { id: string; version: number }>();
  for (const ct of CONSENT_TYPES) {
    const created = await prisma.consentType.create({
      data: {
        key: ct.key,
        label: ct.label,
        version: ct.version,
        required: ct.required,
        forMinorsOnly: ct.forMinorsOnly,
        bodyHtml: `<p>[Treść dostarcza prawnik klubu - placeholder dla "${ct.label}", wersja ${ct.version}.]</p>`,
      },
    });
    consentTypes.set(ct.key, { id: created.id, version: created.version });
  }

  for (const r of CHURN_REASONS) {
    await prisma.churnReason.create({ data: r });
  }

  const planAdultOpen = await prisma.plan.create({
    data: { name: "OPEN Dorośli", priceGross: 24900, durationDays: 30, forMinors: false },
  });
  const planAdultLimited = await prisma.plan.create({
    data: {
      name: "Karnet 8 wejść",
      priceGross: 17900,
      entriesPerMonth: 8,
      durationDays: 30,
      forMinors: false,
    },
  });
  const planKids = await prisma.plan.create({
    data: { name: "OPEN Dzieci", priceGross: 19900, durationDays: 30, forMinors: true },
  });

  // --- Właściciel + trenerzy --------------------------------------------------------
  const ownerUser = await prisma.user.create({
    data: {
      email: "wlasciciel@klubbokserski.pl",
      name: "Właściciel Klubu",
      role: "ADMIN",
      passwordHash,
    },
  });

  const TRAINER_SPECS = [
    { name: "Adam Gąska", locationIdx: 0, targetRetention: 0.63, hiredDaysAgo: 900 },
    { name: "Marek Sroka", locationIdx: 0, targetRetention: 0.5, hiredDaysAgo: 650 },
    { name: "Kuba Wróbel", locationIdx: 1, targetRetention: 0.4, hiredDaysAgo: 500 },
    { name: "Tomek Czapla", locationIdx: 1, targetRetention: 0.27, hiredDaysAgo: 300 },
  ];

  const trainers: {
    id: string;
    userId: string;
    locationId: string;
    targetRetention: number;
  }[] = [];
  for (const [i, spec] of TRAINER_SPECS.entries()) {
    const user = await prisma.user.create({
      data: {
        email: `trener${i + 1}@klubbokserski.pl`,
        name: spec.name,
        role: "TRAINER",
        passwordHash,
        phone: `600${String(100000 + i).slice(-6)}`,
      },
    });
    const location = locations[spec.locationIdx];
    const trainer = await prisma.trainer.create({
      data: {
        userId: user.id,
        locationId: location.id,
        locations: { connect: { id: location.id } },
        hiredAt: daysAgo(spec.hiredDaysAgo),
        active: true,
      },
    });
    trainers.push({
      id: trainer.id,
      userId: user.id,
      locationId: location.id,
      targetRetention: spec.targetRetention,
    });
  }

  // --- Szablony zajęć ----------------------------------------------------------------
  // weekday: konwencja JS Date.getUTCDay() - 0 = niedziela ... 6 = sobota.
  type TemplateSpec = {
    name: string;
    weekday: number;
    startTime: string;
    durationMin: number;
    capacity: number;
    isKids: boolean;
    minAge?: number;
    maxAge?: number;
  };
  const TEMPLATE_SPECS: TemplateSpec[] = [
    {
      name: "Boks - grupa ogólna",
      weekday: 1,
      startTime: "18:00",
      durationMin: 60,
      capacity: 16,
      isKids: false,
    },
    {
      name: "Boks - grupa ogólna",
      weekday: 3,
      startTime: "18:00",
      durationMin: 60,
      capacity: 16,
      isKids: false,
    },
    {
      name: "Boks - grupa ogólna",
      weekday: 5,
      startTime: "18:00",
      durationMin: 60,
      capacity: 16,
      isKids: false,
    },
    {
      name: "Boks - dzieci",
      weekday: 2,
      startTime: "17:00",
      durationMin: 45,
      capacity: 12,
      isKids: true,
      minAge: 6,
      maxAge: 15,
    },
  ];

  const templates: {
    id: string;
    locationId: string;
    trainerId: string;
    isKids: boolean;
    weekday: number;
    startTime: string;
    durationMin: number;
    capacity: number;
    name: string;
  }[] = [];
  for (const location of locations) {
    const locationTrainers = trainers.filter((t) => t.locationId === location.id);
    for (const [tplIdx, spec] of TEMPLATE_SPECS.entries()) {
      const trainer = locationTrainers[tplIdx % locationTrainers.length];
      const created = await prisma.classTemplate.create({
        data: {
          locationId: location.id,
          trainerId: trainer.id,
          name: spec.name,
          weekday: spec.weekday,
          startTime: spec.startTime,
          durationMin: spec.durationMin,
          capacity: spec.capacity,
          isKids: spec.isKids,
          minAge: spec.minAge,
          maxAge: spec.maxAge,
        },
      });
      templates.push({
        id: created.id,
        locationId: location.id,
        trainerId: trainer.id,
        isKids: spec.isKids,
        weekday: spec.weekday,
        startTime: spec.startTime,
        durationMin: spec.durationMin,
        capacity: spec.capacity,
        name: spec.name,
      });
    }
  }

  // --- Sesje: 48 tygodni wstecz od dziś ------------------------------------------------
  const WEEKS_BACK = 48;
  type SessionRow = { id: string; startsAt: Date; locationId: string; isKids: boolean };
  const sessionsByLocationKids = new Map<string, SessionRow[]>();
  function bucketKey(locationId: string, isKids: boolean) {
    return `${locationId}:${isKids}`;
  }

  const startMonday = (() => {
    const d = new Date(daysAgo(WEEKS_BACK * 7));
    const day = d.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d;
  })();

  for (let week = 0; week < WEEKS_BACK + 1; week++) {
    const weekStart = addDays(startMonday, week * 7);
    for (const tpl of templates) {
      const offsetFromMonday = (tpl.weekday + 6) % 7; // 0=Mon..6=Sun -> licząc od poniedziałku
      const sessionDate = addDays(weekStart, offsetFromMonday);
      if (sessionDate > NOW) continue;
      const [hh, mm] = tpl.startTime.split(":").map(Number);
      const startsAt = warsawDateTime(
        sessionDate.getUTCFullYear(),
        sessionDate.getUTCMonth() + 1,
        sessionDate.getUTCDate(),
        hh,
        mm,
      );
      const endsAt = new Date(startsAt.getTime() + tpl.durationMin * 60_000);
      const session = await prisma.session.create({
        data: {
          templateId: tpl.id,
          locationId: tpl.locationId,
          trainerId: tpl.trainerId,
          name: tpl.name,
          startsAt,
          endsAt,
          capacity: tpl.capacity,
        },
      });
      const key = bucketKey(tpl.locationId, tpl.isKids);
      const arr = sessionsByLocationKids.get(key) ?? [];
      arr.push({ id: session.id, startsAt, locationId: tpl.locationId, isKids: tpl.isKids });
      sessionsByLocationKids.set(key, arr);
    }
  }
  for (const arr of sessionsByLocationKids.values()) {
    arr.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  console.warn(`Utworzono ${templates.length} szablonów i sesje dla ${WEEKS_BACK} tygodni wstecz.`);

  // --- Klienci ------------------------------------------------------------------------
  type Bucket = "recent" | "gap" | "churned" | "frozen";
  type MemberSpec = {
    isKid: boolean;
    isMale: boolean;
    firstName: string;
    lastName: string;
    birthDate: Date;
    trainerIdx: number;
    joinedAt: Date;
    bucket: Bucket;
    lastAttendanceAt: Date | null;
    churnedAt: Date | null;
    hasGoal: boolean;
    hasNotes: boolean;
    weightKg: number | null;
  };

  const ADULT_COUNT = 38;
  const KID_COUNT = 14;
  const GAP_COUNT = 9; // "część z ostatnią obecnością 7-20 dni temu"
  const FROZEN_COUNT = 2;

  const memberSpecs: MemberSpec[] = [];

  function buildMember(isKid: boolean, idx: number, trainerIdx: number): MemberSpec {
    const isMale = chance(0.55);
    const firstName = isKid
      ? pick(isMale ? KID_FIRST_NAMES_M : KID_FIRST_NAMES_F)
      : pick(isMale ? ADULT_FIRST_NAMES_M : ADULT_FIRST_NAMES_F);
    const lastName = nextLastName();

    const age = isKid ? randInt(6, 15) : randInt(18, 52);
    const birthDate = new Date(
      Date.UTC(NOW.getUTCFullYear() - age, randInt(0, 11), randInt(1, 28)),
    );

    const joinedDaysAgo = randInt(5, 335);
    const joinedAt = daysAgo(joinedDaysAgo);

    const targetRetention = trainers[trainerIdx].targetRetention;
    const eligibleForChurn = joinedDaysAgo >= 30;
    const willChurn = eligibleForChurn && chance(1 - targetRetention);

    let bucket: Bucket = "recent";
    let lastAttendanceAt: Date | null = null;
    let churnedAt: Date | null = null;

    if (willChurn) {
      bucket = "churned";
      const maxSilence = Math.min(joinedDaysAgo - 8, 200);
      const lastAttDaysAgo = randInt(22, Math.max(22, maxSilence));
      lastAttendanceAt = daysAgo(lastAttDaysAgo);
      churnedAt = addDays(lastAttendanceAt, 21);
      if (churnedAt > NOW) churnedAt = NOW;
    } else {
      lastAttendanceAt = daysAgo(randInt(0, 6));
      bucket = "recent";
    }

    return {
      isKid,
      isMale,
      firstName,
      lastName,
      birthDate,
      trainerIdx,
      joinedAt,
      bucket,
      lastAttendanceAt,
      churnedAt,
      hasGoal: chance(0.8),
      hasNotes: chance(0.82),
      weightKg: isKid ? randFloat(28, 55, 1) : randFloat(58, 96, 1),
    };
  }

  for (let i = 0; i < ADULT_COUNT; i++) {
    memberSpecs.push(buildMember(false, i, i % trainers.length));
  }
  for (let i = 0; i < KID_COUNT; i++) {
    memberSpecs.push(buildMember(true, i, i % trainers.length));
  }

  // Nadpisz część aktywnych osób na "lukę 7-20 dni" - reguła alertów 7/14.
  const activeCandidates = memberSpecs
    .map((m, idx) => ({ m, idx }))
    .filter((x) => x.m.bucket === "recent");
  for (let i = 0; i < Math.min(GAP_COUNT, activeCandidates.length); i++) {
    const target = activeCandidates[i];
    target.m.bucket = "gap";
    target.m.lastAttendanceAt = daysAgo(randInt(7, 20));
  }

  // Oznacz kilka aktywnych dorosłych jako "zamrożony karnet".
  const frozenCandidates = memberSpecs
    .map((m, idx) => ({ m, idx }))
    .filter((x) => !x.m.isKid && (x.m.bucket === "recent" || x.m.bucket === "gap"));
  for (let i = 0; i < Math.min(FROZEN_COUNT, frozenCandidates.length); i++) {
    frozenCandidates[i].m.bucket = "frozen";
  }

  // --- Wstawianie klientów: użytkownicy, opiekunowie, zgody, onboarding, notatki ------
  type Level = "WHITE" | "YELLOW" | "ORANGE" | "GREEN";
  function levelForTenure(days: number): Level {
    if (days < 60) return "WHITE";
    if (days < 150) return "YELLOW";
    if (days < 250) return "ORANGE";
    return "GREEN";
  }

  let guardianCursor = 0;
  const guardianUsers: { id: string }[] = [];

  type CreatedMember = {
    id: string;
    homeLocationId: string;
    ownerTrainerId: string;
    spec: MemberSpec;
  };
  const createdMembers: CreatedMember[] = [];

  for (const spec of memberSpecs) {
    const trainer = trainers[spec.trainerIdx];
    const location = locations.find((l) => l.id === trainer.locationId)!;
    const tenureDays = daysBetween(spec.joinedAt, NOW);

    let userId: string | undefined;
    let guardianUserId: string | undefined;

    if (spec.isKid) {
      // co dwoje dzieci - jeden opiekun, dla uproszczenia i realizmu seeda
      if (guardianUsers.length === 0 || chance(0.5)) {
        const gu = await prisma.user.create({
          data: {
            email: `opiekun${guardianUsers.length + 1}@example.com`,
            name: `${pick(ADULT_FIRST_NAMES_F.concat(ADULT_FIRST_NAMES_M))} ${spec.lastName}`,
            role: "GUARDIAN",
            passwordHash,
            phone: `601${String(200000 + guardianCursor).slice(-6)}`,
          },
        });
        guardianUsers.push({ id: gu.id });
        guardianCursor++;
      }
      guardianUserId = guardianUsers[guardianUsers.length - 1].id;
    } else {
      const emailLocal = `${slug(spec.firstName)}.${slug(spec.lastName)}${createdMembers.length}`;
      const mu = await prisma.user.create({
        data: {
          email: `${emailLocal}@example.com`,
          name: `${spec.firstName} ${spec.lastName}`,
          role: "MEMBER",
          passwordHash,
          phone: `50${String(1000000 + createdMembers.length).slice(-7)}`,
        },
      });
      userId = mu.id;
    }

    const isSparringCleared = !spec.isKid && tenureDays > 30 && chance(0.6);

    const member = await prisma.member.create({
      data: {
        userId,
        guardianUserId,
        ownerTrainerId: trainer.id,
        homeLocationId: location.id,
        firstName: spec.firstName,
        lastName: spec.lastName,
        birthDate: spec.birthDate,
        isMinor: spec.isKid,
        sex: spec.isMale ? "MALE" : "FEMALE",
        weightKg: spec.weightKg,
        level: levelForTenure(tenureDays),
        goal: spec.hasGoal
          ? pick([
              "Redukcja wagi i kondycja",
              "Nauka techniki od podstaw",
              "Przygotowanie do pierwszej walki sparingowej",
              "Regularny trening 2x w tygodniu",
              "Powrót do formy po przerwie",
              "Budowa siły i wytrzymałości",
            ])
          : null,
        status: spec.bucket === "churned" ? "CHURNED" : "ACTIVE",
        joinedAt: spec.joinedAt,
        churnedAt: spec.churnedAt,
        sparringClearedAt: isSparringCleared ? addDays(spec.joinedAt, 30) : null,
        sparringClearedByTrainerId: isSparringCleared ? trainer.id : null,
      },
    });

    createdMembers.push({
      id: member.id,
      homeLocationId: location.id,
      ownerTrainerId: trainer.id,
      spec,
    });

    // Zgody
    const requiredKeys = ["reg", "rodo", "health", ...(spec.isKid ? ["guardian"] : [])];
    const grantedByUserId = spec.isKid ? guardianUserId! : userId!;
    for (const key of requiredKeys) {
      const ct = consentTypes.get(key)!;
      await prisma.consent.create({
        data: {
          memberId: member.id,
          consentTypeId: ct.id,
          version: ct.version,
          grantedAt: spec.joinedAt,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0 (seed)",
          grantedByUserId,
        },
      });
    }
    if (chance(0.7)) {
      const ct = consentTypes.get("image")!;
      await prisma.consent.create({
        data: {
          memberId: member.id,
          consentTypeId: ct.id,
          version: ct.version,
          grantedAt: spec.joinedAt,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0 (seed)",
          grantedByUserId,
        },
      });
    }

    // Onboarding: 3 etapy, część niekompletna - to ma być widoczne jako luka.
    const authorUserId = trainer.userId;
    const ONBOARDING_OFFSETS: { step: 1 | 2 | 3; offset: number }[] = [
      { step: 1, offset: 3 },
      { step: 2, offset: 14 },
      { step: 3, offset: 84 },
    ];
    for (const { step, offset } of ONBOARDING_OFFSETS) {
      const dueAt = addDays(spec.joinedAt, offset);
      const isDue = dueAt <= NOW;
      const willComplete = isDue && spec.hasNotes && chance(0.75);
      let noteId: string | undefined;
      let completedAt: Date | undefined;
      if (willComplete) {
        const note = await prisma.note.create({
          data: {
            memberId: member.id,
            authorUserId,
            kind: "ONBOARDING",
            body: pick([
              "Rozmowa wstępna: ustaliliśmy cel treningowy i omówiliśmy pomiar wyjściowy formy.",
              "Kontakt kontrolny - klient zadowolony, kontynuuje zgodnie z planem treningowym.",
              "Retest po ustalonym okresie - widoczna poprawa kondycji, omówiono dalsze kroki.",
            ]),
          },
        });
        noteId = note.id;
        completedAt = addDays(dueAt, randInt(0, 3));
      }
      await prisma.onboardingStep.create({
        data: { memberId: member.id, step, dueAt, completedAt, noteId },
      });
    }

    // Kilka dodatkowych notatek kontaktowych dla dłużej trenujących - poza onboardingiem.
    if (spec.hasNotes && tenureDays > 45 && chance(0.4)) {
      await prisma.note.create({
        data: {
          memberId: member.id,
          authorUserId,
          kind: "CONTACT",
          body: pick([
            "Krótka rozmowa po treningu - pytał o możliwość dołączenia do grupy sparingowej.",
            "Zapytałem o samopoczucie po dłuższej przerwie, zapewnił że wraca do regularnych treningów.",
            "Omówiliśmy postępy w technice - widoczna poprawa, warto pochwalić na następnych zajęciach.",
          ]),
        },
      });
    }
  }

  console.warn(
    `Utworzono ${createdMembers.length} klientów (${ADULT_COUNT} dorosłych + ${KID_COUNT} dzieci).`,
  );

  // --- Karnety i płatności (model gotówkowy, bez auto-odnawiania) ----------------------
  const allPayments: {
    id: string;
    memberId: string;
    locationId: string;
    amountGross: number;
    recordedAt: Date;
    recordedByUserId: string;
  }[] = [];

  for (const cm of createdMembers) {
    const { spec } = cm;
    const plan = spec.isKid ? planKids : chance(0.5) ? planAdultOpen : planAdultLimited;
    const soldByUserId = chance(0.85)
      ? trainers.find((t) => t.id === cm.ownerTrainerId)!.userId
      : ownerUser.id;

    const renewalBound = spec.bucket === "churned" ? (spec.lastAttendanceAt ?? spec.joinedAt) : NOW;

    let cursor = spec.joinedAt;
    let lastPassId = "";
    let lastPassEndsAt = cursor;
    let iterations = 0;
    while (cursor <= renewalBound && iterations < 14) {
      iterations++;
      const startsAt = cursor;
      const endsAt = addDays(startsAt, plan.durationDays);
      const isCurrentPass = endsAt >= renewalBound;
      const entriesLeft =
        plan.entriesPerMonth == null
          ? null
          : isCurrentPass
            ? randInt(1, plan.entriesPerMonth)
            : randInt(0, plan.entriesPerMonth);

      const pass = await prisma.pass.create({
        data: {
          memberId: cm.id,
          planId: plan.id,
          startsAt,
          endsAt,
          entriesLeft,
          // Karnet z minionym endsAt jest EXPIRED od razu - inaczej cały łańcuch
          // odnowień poza ostatnim zostaje błędnie oznaczony jako aktywny.
          status: endsAt <= NOW ? "EXPIRED" : "ACTIVE",
          soldByUserId,
        },
      });
      lastPassId = pass.id;
      lastPassEndsAt = endsAt;

      const method = chance(0.6) ? "CASH" : chance(0.75) ? "BLIK" : "TRANSFER";
      const payment = await prisma.payment.create({
        data: {
          memberId: cm.id,
          passId: pass.id,
          amountGross: plan.priceGross,
          method,
          locationId: cm.homeLocationId,
          recordedByUserId: soldByUserId,
          recordedAt: startsAt,
        },
      });
      allPayments.push({
        id: payment.id,
        memberId: cm.id,
        locationId: cm.homeLocationId,
        amountGross: payment.amountGross,
        recordedAt: payment.recordedAt,
        recordedByUserId: soldByUserId,
      });

      cursor = endsAt;
    }

    // Status ACTIVE/EXPIRED jest już poprawnie ustawiony per-karnet powyżej.
    // Tu tylko nadpisujemy wyznaczonych klientów na FROZEN dla realizmu seeda.
    if (lastPassId && spec.bucket === "frozen") {
      const frozenDaysUsed = randInt(5, 20);
      await prisma.pass.update({
        where: { id: lastPassId },
        data: {
          status: "FROZEN",
          frozenAt: daysAgo(randInt(1, 5)),
          frozenDaysUsed,
          endsAt: addDays(lastPassEndsAt, frozenDaysUsed),
        },
      });
    }
  }

  // Kilka korekt płatności - "pomyłka to nowy wpis z correctsPaymentId i kwotą ujemną".
  const correctionSample = allPayments
    .filter((p) => p.amountGross > 0)
    .sort(() => rng() - 0.5)
    .slice(0, 3);
  for (const original of correctionSample) {
    await prisma.payment.create({
      data: {
        memberId: original.memberId,
        amountGross: -original.amountGross,
        method: "CASH",
        locationId: original.locationId,
        recordedByUserId: original.recordedByUserId,
        recordedAt: addDays(original.recordedAt, 1),
        correctsPaymentId: original.id,
        note: "Pomyłka przy wpisywaniu kwoty - korekta.",
      },
    });
  }

  console.warn(`Zapisano historię karnetów i płatności, w tym ${correctionSample.length} korekt.`);

  // --- Rezerwacje i obecności -----------------------------------------------------------
  let bookingCount = 0;
  let attendanceCount = 0;

  for (const cm of createdMembers) {
    const { spec } = cm;
    const pool = sessionsByLocationKids.get(bucketKey(cm.homeLocationId, spec.isKid)) ?? [];
    const windowEnd = spec.lastAttendanceAt ?? NOW;
    const eligible = pool.filter((s) => s.startsAt >= spec.joinedAt && s.startsAt <= windowEnd);

    for (const s of eligible) {
      if (chance(0.5)) {
        const method = chance(0.85) ? "QR" : "MANUAL";
        await prisma.booking.create({
          data: { sessionId: s.id, memberId: cm.id, status: "ATTENDED" },
        });
        await prisma.attendance.create({
          data: { sessionId: s.id, memberId: cm.id, checkedInAt: s.startsAt, method },
        });
        bookingCount++;
        attendanceCount++;
      }
    }
    // gwarantuj, że ostatnia sesja w oknie ma zaliczoną obecność - zgodność z lastAttendanceAt
    if (eligible.length > 0) {
      const last = eligible[eligible.length - 1];
      const already = await prisma.attendance.findUnique({
        where: { sessionId_memberId: { sessionId: last.id, memberId: cm.id } },
      });
      if (!already) {
        await prisma.booking.create({
          data: { sessionId: last.id, memberId: cm.id, status: "ATTENDED" },
        });
        await prisma.attendance.create({
          data: { sessionId: last.id, memberId: cm.id, checkedInAt: last.startsAt, method: "QR" },
        });
        bookingCount++;
        attendanceCount++;
      }
    }

    // kilka nadchodzących/ostatnich rezerwacji bez obecności (NO_SHOW) dla realizmu
    if (!spec.isKid && spec.bucket !== "churned" && chance(0.15)) {
      const futureCandidates = pool.filter((s) => s.startsAt > windowEnd && s.startsAt <= NOW);
      if (futureCandidates.length > 0) {
        const s = pick(futureCandidates);
        await prisma.booking.create({
          data: { sessionId: s.id, memberId: cm.id, status: "NO_SHOW" },
        });
        bookingCount++;
      }
    }
  }

  console.warn(`Utworzono ${bookingCount} rezerwacji i ${attendanceCount} obecności.`);
  console.warn("Seed zakończony.");
  console.warn(`Dane logowania (wszyscy użytkownicy): hasło "${DEV_PASSWORD}"`);
  console.warn(`  Właściciel: wlasciciel@klubbokserski.pl`);
  console.warn(`  Trenerzy:   trener1..4@klubbokserski.pl`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
