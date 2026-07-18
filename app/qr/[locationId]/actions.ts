"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { isWithinCheckInWindow } from "@/lib/domain/booking";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { markJoinedIfNeeded } from "@/lib/services/member";

export async function checkInAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { session: true },
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
    await decrementPassEntryIfLimited(tx, booking.memberId);
    await markJoinedIfNeeded(tx, booking.memberId, now);
  });

  redirect(`/qr/${booking.session.locationId}?success=1`);
}
