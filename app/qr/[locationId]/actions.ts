"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { isWithinCheckInWindow } from "@/lib/domain/booking";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { markJoinedIfNeeded } from "@/lib/services/member";
import { notifyGuardianCheckIn } from "@/lib/services/notify";

export async function checkInAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { session: true, member: { include: { guardianUser: true } } },
  });
  await requireMemberAccess(booking.memberId);

  const now = new Date();
  if (booking.status !== "BOOKED" || !isWithinCheckInWindow(booking.session.startsAt, now)) {
    redirect(`/qr/${booking.session.locationId}?error=WINDOW`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendance.upsert({
      where: { sessionId_memberId: { sessionId: booking.sessionId, memberId: booking.memberId } },
      create: { sessionId: booking.sessionId, memberId: booking.memberId, method: "QR" },
      update: {},
    });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "ATTENDED" } });
    await decrementPassEntryIfLimited(tx, booking.memberId, booking.session.kind);
    await markJoinedIfNeeded(tx, booking.memberId, now);
  });

  // "Dziecko weszło na salę" (SPEC.md sekcja 3) - tylko przy realnym check-inie
  // QR, nigdy przy ręcznym uzupełnieniu przez trenera. Best-effort: awaria
  // powiadomienia nigdy nie blokuje samego check-inu.
  if (booking.member.isMinor && booking.member.guardianUser) {
    try {
      await notifyGuardianCheckIn(
        booking.member.guardianUser.id,
        `${booking.member.firstName} ${booking.member.lastName}`,
        booking.sessionId,
      );
    } catch {
      // celowo połknięte - patrz komentarz wyżej
    }
  }

  redirect(`/qr/${booking.session.locationId}?success=1`);
}
