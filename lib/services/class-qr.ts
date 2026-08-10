import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkScanTime, type ScanRejection } from "@/lib/domain/class-qr";
import { effectiveTrainerId } from "@/lib/domain/substitute";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { markJoinedIfNeeded } from "@/lib/services/member";
import { getClubSettings } from "@/lib/services/settings";

// Odbicia na zajęciach kodem QR wyświetlanym na sali.
//
// Kod należy do KONKRETNYCH zajęć i jest losowany przy pierwszym pokazaniu.
// Skanuje go prowadzący i klubowicze własnym telefonem - to znaczy, że muszą
// być na miejscu, bo kodu nie ma nigdzie indziej i po zajęciach przestaje
// działać.

// 16 bajtów w base64url. Kod ma być nie do zgadnięcia, ale i nie do przepisania
// z ekranu - i tak wchodzi się przez skan.
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

// Odbicie kodem zajęć. Jedna procedura dla trenera i dla klubowicza, bo kod
// jest ten sam - o tym, co się stanie, decyduje to, kim jest skanujący.
export async function scanClassQr(input: {
  token: string;
  userId: string;
  now?: Date;
}): Promise<ScanOutcome> {
  const now = input.now ?? new Date();
  const settings = await getClubSettings();

  const session = await prisma.session.findUnique({
    where: { qrToken: input.token },
    include: {
      trainer: { include: { user: true } },
      substituteTrainer: { include: { user: true } },
    },
  });
  if (!session) return { ok: false, reason: "UNKNOWN_CODE" };

  const timeError = checkScanTime(session, now, settings.qrOpensMinutesBefore);
  if (timeError) return { ok: false, reason: timeError };

  // Prowadzący (albo zaakceptowany zastępca) odbija się jako trener.
  const leadTrainerId = effectiveTrainerId(session);
  const trainerUserId =
    leadTrainerId === session.trainerId
      ? session.trainer.userId
      : (session.substituteTrainer?.userId ?? null);

  if (trainerUserId === input.userId) {
    if (session.trainerCheckedInAt) {
      return { ok: false, reason: "ALREADY_CHECKED_IN" };
    }
    const deadline = new Date(
      session.startsAt.getTime() - settings.trainerCheckInMinutesBefore * 60_000,
    );
    await prisma.session.update({
      where: { id: session.id },
      data: { trainerCheckedInAt: now, trainerCheckedInUserId: input.userId },
    });
    return {
      ok: true,
      role: "TRAINER",
      late: now > deadline,
      sessionName: session.name,
      startsAt: session.startsAt,
    };
  }

  // Klubowicz: odbić może się tylko ten, kto ma zapis na te zajęcia. Konto
  // opiekuna odbija dziecko, które ma zapis - stąd szukamy po wszystkich
  // kartotekach dostępnych z tego konta.
  const booking = await prisma.booking.findFirst({
    where: {
      sessionId: session.id,
      status: { in: ["BOOKED", "ATTENDED"] },
      member: {
        OR: [{ user: { id: input.userId } }, { guardianUserId: input.userId }],
      },
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
