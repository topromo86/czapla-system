"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnsSession, requireTrainerSelf } from "@/lib/auth/guard";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { markJoinedIfNeeded } from "@/lib/services/member";

// Ręczne uzupełnienie obecności przez trenera - method: MANUAL, wykluczone
// z KPI (CLAUDE.md reguła 2: trener nie ocenia sam siebie własnymi wpisami).
export async function markManualAttendanceAction(formData: FormData) {
  const { trainer } = await requireTrainerSelf();
  const bookingId = String(formData.get("bookingId"));

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await requireOwnsSession(booking.sessionId);

  await prisma.$transaction(async (tx) => {
    await tx.attendance.upsert({
      where: { sessionId_memberId: { sessionId: booking.sessionId, memberId: booking.memberId } },
      create: {
        sessionId: booking.sessionId,
        memberId: booking.memberId,
        method: "MANUAL",
        recordedByUserId: trainer.userId,
      },
      update: {},
    });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "ATTENDED" } });
    await decrementPassEntryIfLimited(tx, booking.memberId);
    await markJoinedIfNeeded(tx, booking.memberId, new Date());
  });

  revalidatePath("/trainer");
}

// Odwołanie całych zajęć: wszystkie rezerwacje -> CANCELLED, żadne wejście
// nie przepada (SPEC.md sekcja 2 - to nie jest wina klienta).
export async function cancelSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId"));
  const reason = String(formData.get("reason") ?? "").trim();
  await requireOwnsSession(sessionId);

  if (reason.length < 3) {
    throw new Error("Podaj powód odwołania zajęć.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", cancelledReason: reason },
    });
    await tx.booking.updateMany({
      where: { sessionId, status: { in: ["BOOKED", "WAITLIST"] } },
      data: { status: "CANCELLED", cancelledAt: now, waitlistPosition: null },
    });
  });

  revalidatePath("/trainer");
}

// Zastępstwo: inny trener z tej samej lokalizacji przejmuje prowadzenie zajęć.
export async function assignSubstituteAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId"));
  const substituteTrainerId = String(formData.get("substituteTrainerId"));
  await requireOwnsSession(sessionId);

  await prisma.session.update({
    where: { id: sessionId },
    data: { substituteTrainerId },
  });

  revalidatePath("/trainer");
}
