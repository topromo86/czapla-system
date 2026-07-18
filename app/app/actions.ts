"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import {
  evaluateBookingEligibility,
  nextWaitlistPosition,
  nextWaitlistPromotion,
  resolveCancellationOutcome,
} from "@/lib/domain/booking";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";

function readReturnTo(formData: FormData): string {
  const value = formData.get("returnTo");
  return typeof value === "string" && value.startsWith("/app") ? value : "/app";
}

function withError(returnTo: string, reason: string): string {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}error=${reason}`;
}

export async function bookSessionAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const sessionId = String(formData.get("sessionId"));
  const returnTo = readReturnTo(formData);

  await requireMemberAccess(memberId);

  const [member, session] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { template: true, bookings: true },
    }),
  ]);

  const existing = session.bookings.find((b) => b.memberId === memberId);
  if (existing && (existing.status === "BOOKED" || existing.status === "WAITLIST")) {
    redirect(withError(returnTo, "ALREADY_BOOKED"));
  }

  const now = new Date();
  const consents = await prisma.consent.findMany({
    where: { memberId, revokedAt: null },
    include: { consentType: true },
  });
  const grantedConsentKeys = new Set(consents.map((c) => c.consentType.key));

  const activePass = await prisma.pass.findFirst({
    where: { memberId, status: "ACTIVE" },
    orderBy: { endsAt: "desc" },
  });

  const bookedCount = session.bookings.filter((b) => b.status === "BOOKED").length;

  const result = evaluateBookingEligibility({
    now,
    memberBirthDate: member.birthDate,
    memberIsMinor: member.isMinor,
    grantedConsentKeys,
    activePass,
    session: {
      startsAt: session.startsAt,
      capacity: session.capacity,
      minAge: session.template?.minAge,
      maxAge: session.template?.maxAge,
      status: session.status,
    },
    bookedCount,
  });

  if (!result.ok) {
    redirect(withError(returnTo, result.reason));
  }

  const waitlist = session.bookings.filter((b) => b.status === "WAITLIST");
  const status = result.willWaitlist ? "WAITLIST" : "BOOKED";
  const waitlistPosition = result.willWaitlist ? nextWaitlistPosition(waitlist) : null;

  await prisma.booking.upsert({
    where: { sessionId_memberId: { sessionId, memberId } },
    create: { sessionId, memberId, status, waitlistPosition },
    update: { status, waitlistPosition, cancelledAt: null },
  });

  redirect(returnTo);
}

export async function cancelBookingAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const returnTo = readReturnTo(formData);

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { session: true },
  });
  await requireMemberAccess(booking.memberId);

  const now = new Date();
  const wasBooked = booking.status === "BOOKED";
  const outcome =
    booking.status === "WAITLIST"
      ? "CANCELLED"
      : resolveCancellationOutcome(booking.session.startsAt, now);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: outcome, cancelledAt: now, waitlistPosition: null },
    });

    // Spóźnione odwołanie = NO_SHOW = wejście przepada, dokładnie jak przy
    // realnej obecności (SPEC.md sekcja 2).
    if (outcome === "NO_SHOW") {
      await decrementPassEntryIfLimited(tx, booking.memberId);
    }

    // Zwolnione miejsce (odwołanie na czas lub spóźnione, oba fizycznie
    // zwalniają miejsce przed zajęciami) - awans z listy rezerwowej w tej
    // samej transakcji, żeby dwie osoby nie weszły na jedno miejsce.
    if (wasBooked) {
      const waitlist = await tx.booking.findMany({
        where: { sessionId: booking.sessionId, status: "WAITLIST" },
      });
      const promoted = nextWaitlistPromotion(waitlist);
      if (promoted) {
        await tx.booking.update({
          where: { id: promoted.id },
          data: { status: "BOOKED", waitlistPosition: null },
        });
      }
    }
  });

  redirect(returnTo);
}
