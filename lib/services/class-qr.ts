import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkScanTime, qrWindow, type ScanRejection } from "@/lib/domain/class-qr";
import { effectiveTrainerId } from "@/lib/domain/substitute";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { markJoinedIfNeeded } from "@/lib/services/member";
import { verifyRotatingCode } from "@/lib/services/rotating-code";
import { getClubSettings } from "@/lib/services/settings";

// Odbicia na zajęciach. Dwie drogi, jedna reguła:
//
// 1. Prowadzący pokazuje swój kod rotacyjny kamerze kiosku (30 s ważności).
//    To jest jedyna droga, która DOWODZI obecności na sali - kod trzeba
//    fizycznie pokazać urządzeniu klubu i trafić w 30-sekundowe okno.
// 2. Klubowicz skanuje telefonem kod zajęć z ekranu kiosku. Wygodne i szybkie
//    dla dwudziestu osób naraz; prawdziwym zapisem i tak jest liczba, którą po
//    zajęciach zatwierdza trener.

function newToken(): string {
  return randomBytes(16).toString("base64url");
}

// Kod zajęć. Losujemy leniwie: dopóki nikt nie wyświetlił kodu, zajęcia go nie
// potrzebują. Wyścig dwóch tabletów rozstrzyga baza (qrToken jest unikalny),
// więc przy kolizji po prostu czytamy zapisany kod ponownie.
export async function getOrCreateSessionQrToken(sessionId: string): Promise<string> {
  const existing = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { qrToken: true },
  });
  if (existing.qrToken) return existing.qrToken;

  const token = newToken();
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { qrToken: token },
    select: { qrToken: true },
  });
  return updated.qrToken ?? token;
}

export type ScanOutcome =
  | { ok: false; reason: ScanRejection }
  | { ok: true; role: "TRAINER"; late: boolean; sessionName: string; startsAt: Date }
  | { ok: true; role: "MEMBER"; memberName: string; sessionName: string; startsAt: Date };

const SESSION_INCLUDE = {
  trainer: { include: { user: true } },
  substituteTrainer: { include: { user: true } },
} as const;

type SessionWithTrainers = Awaited<
  ReturnType<typeof prisma.session.findFirstOrThrow<{ include: typeof SESSION_INCLUDE }>>
>;

// Konto prowadzącego te zajęcia - z uwzględnieniem przyjętego zastępstwa.
function leadTrainerUserId(session: SessionWithTrainers): string {
  return effectiveTrainerId(session) === session.trainerId
    ? session.trainer.userId
    : (session.substituteTrainer?.userId ?? session.trainer.userId);
}

// Odbicie konkretnej osoby na konkretnych zajęciach. Sedno całego modułu -
// obie drogi (kod zajęć z ekranu, kod osobisty z kamery) kończą się tutaj,
// więc reguły nie mają jak się rozjechać.
async function checkInUserToSession(input: {
  session: SessionWithTrainers;
  userId: string;
  now: Date;
  trainerCheckInMinutesBefore: number;
}): Promise<ScanOutcome> {
  const { session, userId, now } = input;

  if (leadTrainerUserId(session) === userId) {
    if (session.trainerCheckedInAt) return { ok: false, reason: "ALREADY_CHECKED_IN" };

    const deadline = new Date(
      session.startsAt.getTime() - input.trainerCheckInMinutesBefore * 60_000,
    );
    await prisma.session.update({
      where: { id: session.id },
      data: { trainerCheckedInAt: now, trainerCheckedInUserId: userId },
    });
    return {
      ok: true,
      role: "TRAINER",
      late: now > deadline,
      sessionName: session.name,
      startsAt: session.startsAt,
    };
  }

  // Klubowicz: odbić może się tylko ten, kto ma zapis. Konto opiekuna odbija
  // dziecko, które ma zapis - stąd szukamy po kartotekach dostępnych z konta.
  const booking = await prisma.booking.findFirst({
    where: {
      sessionId: session.id,
      status: { in: ["BOOKED", "ATTENDED"] },
      member: { OR: [{ user: { id: userId } }, { guardianUserId: userId }] },
    },
    include: { member: true },
  });
  if (!booking) return { ok: false, reason: "NOT_ON_LIST" };

  const already = await prisma.attendance.findUnique({
    where: { sessionId_memberId: { sessionId: session.id, memberId: booking.memberId } },
  });
  if (already) return { ok: false, reason: "ALREADY_CHECKED_IN" };

  await prisma.$transaction(async (tx) => {
    await tx.attendance.create({
      data: { sessionId: session.id, memberId: booking.memberId, method: "QR" },
    });
    await tx.booking.update({ where: { id: booking.id }, data: { status: "ATTENDED" } });
    // Wejście schodzi z karnetu pasującego do rodzaju zajęć - ta sama reguła
    // co przy każdym innym odbiciu obecności.
    await decrementPassEntryIfLimited(tx, booking.memberId, session.kind);
    await markJoinedIfNeeded(tx, booking.memberId, now);
  });

  return {
    ok: true,
    role: "MEMBER",
    memberName: `${booking.member.firstName} ${booking.member.lastName}`,
    sessionName: session.name,
    startsAt: session.startsAt,
  };
}

// Droga 1: klubowicz zeskanował telefonem kod zajęć z ekranu kiosku.
export async function scanClassQr(input: {
  token: string;
  userId: string;
  now?: Date;
}): Promise<ScanOutcome> {
  const now = input.now ?? new Date();
  const settings = await getClubSettings();

  const session = await prisma.session.findUnique({
    where: { qrToken: input.token },
    include: SESSION_INCLUDE,
  });
  if (!session) return { ok: false, reason: "UNKNOWN_CODE" };

  const timeError = checkScanTime(session, now, settings.qrOpensMinutesBefore);
  if (timeError) return { ok: false, reason: timeError };

  return checkInUserToSession({
    session,
    userId: input.userId,
    now,
    trainerCheckInMinutesBefore: settings.trainerCheckInMinutesBefore,
  });
}

export type StationScanOutcome =
  ScanOutcome | { ok: false; reason: "CODE_EXPIRED" | "CODE_INVALID" | "NO_OPEN_CLASS" };

// Droga 2: kiosk zeskanował osobisty kod rotacyjny. Kod mówi, KTO stoi przed
// kamerą; zajęcia wybieramy z grafiku tej sali.
export async function checkInAtStation(input: {
  code: string;
  locationId: string;
  now?: Date;
}): Promise<StationScanOutcome> {
  const now = input.now ?? new Date();
  const settings = await getClubSettings();

  const verdict = verifyRotatingCode(input.code, now);
  if (!verdict.ok) {
    // Wygasły kod to najczęstszy przypadek przy kamerze (ktoś pokazał zrzut
    // ekranu albo trzymał telefon zbyt długo) - ma własny komunikat.
    return { ok: false, reason: verdict.reason === "EXPIRED" ? "CODE_EXPIRED" : "CODE_INVALID" };
  }

  const candidates = await prisma.session.findMany({
    where: {
      locationId: input.locationId,
      status: "SCHEDULED",
      endsAt: { gte: now },
      startsAt: { lte: new Date(now.getTime() + 12 * 3_600_000) },
    },
    include: SESSION_INCLUDE,
    orderBy: { startsAt: "asc" },
  });

  const open = candidates.filter((s) => {
    const window = qrWindow(s, settings.qrOpensMinutesBefore);
    return now >= window.opensAt && now <= window.closesAt;
  });
  if (open.length === 0) return { ok: false, reason: "NO_OPEN_CLASS" };

  // W sali potrafią wypaść dwie grupy pod rząd. Wybieramy te zajęcia, które
  // realnie dotyczą tej osoby - prowadzi je albo ma na nie zapis. Dopiero przy
  // remisie decyduje kolejność w grafiku.
  const own = await Promise.all(
    open.map(async (s) => {
      if (leadTrainerUserId(s) === verdict.userId) return s;
      const booking = await prisma.booking.findFirst({
        where: {
          sessionId: s.id,
          status: { in: ["BOOKED", "ATTENDED"] },
          member: { OR: [{ user: { id: verdict.userId } }, { guardianUserId: verdict.userId }] },
        },
        select: { id: true },
      });
      return booking ? s : null;
    }),
  );

  const session = own.find((s) => s !== null) ?? null;
  if (!session) return { ok: false, reason: "NOT_ON_LIST" };

  return checkInUserToSession({
    session,
    userId: verdict.userId,
    now,
    trainerCheckInMinutesBefore: settings.trainerCheckInMinutesBefore,
  });
}
