"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import {
  evaluateBookingEligibility,
  nextWaitlistPosition,
  nextWaitlistPromotion,
  resolveCancellationOutcome,
} from "@/lib/domain/booking";
import {
  ABSENCE_REASON_LABEL,
  isAbsenceReason,
  resolveAbsenceOutcome,
  resolveAbsenceRangeEnd,
} from "@/lib/domain/absence";
import { safeReturnPath } from "@/lib/domain/return-path";
import { zonedTimeToUtc } from "@/lib/domain/time";
import { getClubSettings } from "@/lib/services/settings";
import { decrementPassEntryIfLimited, findPassForSession } from "@/lib/services/pass";
import { logActivity } from "@/lib/services/activity";
import { notify } from "@/lib/services/notification";
import { formatDate, formatDayTime } from "@/lib/format";

// Zapisać można się z dwóch miejsc: z plannera w /app i ze strony konkretnych
// zajęć /zapis (wejście z witryny klubu). Obie gałęzie są dozwolone jako powrót,
// reszta odpada - patrz lib/domain/return-path.ts.
const RETURN_PREFIXES = ["/app", "/zapis"] as const;

function readReturnTo(formData: FormData): string {
  return safeReturnPath(formData.get("returnTo"), RETURN_PREFIXES, "/app");
}

function withError(returnTo: string, reason: string): string {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}error=${reason}`;
}

// Zwolnione miejsce oddajemy pierwszej osobie z listy rezerwowej. Wyciągnięte
// z cancelBookingAction, bo tę samą rzecz robią teraz trzy ścieżki odwołania
// (zwykłe, pojedyncza nieobecność, przerwa do daty).
async function promoteFromWaitlist(tx: Prisma.TransactionClient, sessionId: string) {
  const waitlist = await tx.booking.findMany({ where: { sessionId, status: "WAITLIST" } });
  const promoted = nextWaitlistPromotion(waitlist);
  if (promoted) {
    await tx.booking.update({
      where: { id: promoted.id },
      data: { status: "BOOKED", waitlistPosition: null },
    });
  }
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
      include: { template: true, bookings: true, location: true },
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

  // Ten sam karnet, z którego potem zejdzie wejście - inaczej klient
  // przechodziłby kontrolę na jednym karnecie, a płacił drugim.
  const activePass = await findPassForSession(prisma, memberId, session.kind);

  const bookedCount = session.bookings.filter((b) => b.status === "BOOKED").length;

  // Czy klient ma już inną aktywną rezerwację - decyduje o bramie "pierwszych
  // zajęć" dla kont bez dostarczonych podpisanych zgód. Liczymy wszystko poza
  // odwołanymi (obecność/nieobecność też liczy się jako wykorzystane wejście).
  const otherActiveBookings = await prisma.booking.count({
    where: { memberId, status: { not: "CANCELLED" }, sessionId: { not: sessionId } },
  });

  const result = evaluateBookingEligibility({
    now,
    memberApproved: member.approvalStatus === "APPROVED",
    consentsDelivered: member.consentsDeliveredAt != null,
    hasOtherActiveBooking: otherActiveBookings > 0,
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

  // Potwierdzenie zapisu (Etap 3). Tylko dla realnej rezerwacji, nie listy
  // rezerwowej - "potwierdzamy" dopiero pewne miejsce. Idzie przez notify, więc
  // respektuje preferencje klienta (opcja wyłączenia w /app/powiadomienia) i nie
  // zdublikuje się przy ponownym zapisie na te same zajęcia (NotificationLog).
  // Dla niepełnoletnich potwierdzenie trafia do opiekuna.
  if (status === "BOOKED") {
    const targetUserId = member.isMinor
      ? member.guardianUserId
      : (member.userId ?? member.guardianUserId);
    if (targetUserId) {
      await notify({
        userId: targetUserId,
        type: "BOOKING_CONFIRMATION",
        subjectId: sessionId,
        title: "Zapis potwierdzony",
        body: `${session.name}, ${formatDayTime(session.startsAt)} - ${session.location.name}.`,
      });
    }
  }

  redirect(returnTo);
}

// Ocena zajęć - "1 kliknięcie" (SPEC.md sekcja 4 "ratingRequest"). Brak
// infrastruktury do wysyłki prośby godzinę po zajęciach (push tylko dla
// GUARDIAN, patrz Faza 4) - zamiast tego widoczny baner w /app dla
// nieocenionych obecności starszych niż godzina, ten sam wzorzec co przy
// awansie z listy rezerwowej w Fazie 1.
export async function rateSessionAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const sessionId = String(formData.get("sessionId"));
  const score = Number(formData.get("score"));
  const returnTo = readReturnTo(formData);

  await requireMemberAccess(memberId);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error("Nieprawidłowa ocena.");
  }

  // Opinia jest opcjonalna - sama ocena to nadal jedno kliknięcie (SPEC.md
  // sekcja 4). Czyta ją wyłącznie właściciel, razem z imieniem autora; trener
  // nie ma do niej dostępu w ogóle. To właśnie obiecujemy klientowi przy polu
  // opinii i tak samo opisuje to panel app/admin/opinie - te trzy miejsca
  // muszą mówić to samo, inaczej okłamujemy klubowiczów.
  const comment = String(formData.get("comment") ?? "").trim();

  await prisma.rating.upsert({
    where: { sessionId_memberId: { sessionId, memberId } },
    create: { sessionId, memberId, score, comment: comment || null },
    update: { score, ...(comment ? { comment } : {}) },
  });

  redirect(returnTo);
}

// Nieobecność na KONKRETNYCH zajęciach: odwołuje rezerwację i zostawia powód,
// który trener widzi na rozpisce. Wcześniej zgłoszenie nieobecności nie
// odwoływało niczego - klient znikał z sali, ale zostawał na liście obecności.
export async function reportSessionAbsenceAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const returnTo = readReturnTo(formData);

  if (!isAbsenceReason(reason)) throw new Error("Nieprawidłowy powód.");

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { session: true },
  });
  const session = await requireMemberAccess(booking.memberId);

  if (booking.status !== "BOOKED" && booking.status !== "WAITLIST") {
    redirect(withError(returnTo, "ALREADY_CANCELLED"));
  }

  const now = new Date();
  const { freeCancellationHours } = await getClubSettings();
  const wasBooked = booking.status === "BOOKED";
  const outcome =
    booking.status === "WAITLIST"
      ? "CANCELLED"
      : resolveAbsenceOutcome(booking.session.startsAt, now, freeCancellationHours);

  await prisma.$transaction(async (tx) => {
    // Okno bezkosztowego odwołania obowiązuje tak samo jak przy zwykłym
    // odwołaniu - zgłoszenie powodu nie jest furtką. Trener może zwrócić
    // wejście ręcznie.
    const chargedPassId =
      outcome === "NO_SHOW"
        ? await decrementPassEntryIfLimited(tx, booking.memberId, booking.session.kind)
        : null;

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: outcome,
        cancelledAt: now,
        waitlistPosition: null,
        absenceReason: reason,
        cancellationNote: note || null,
        chargedPassId,
      },
    });

    if (wasBooked) {
      await promoteFromWaitlist(tx, booking.sessionId);
    }

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "ABSENCE_REPORTED",
      memberId: booking.memberId,
      summary: `Zgłoszono nieobecność (${ABSENCE_REASON_LABEL[reason]}) na "${booking.session.name}" ${formatDayTime(booking.session.startsAt)}${outcome === "NO_SHOW" ? " - wejście przepadło" : ""}`,
    });
  });

  redirect(returnTo);
}

// Przerwa w treningach do wskazanej daty: jedno zgłoszenie odwołuje wszystkie
// rezerwacje w tym okresie. Wstrzymuje też alerty o braku treningu
// (lib/jobs/detect-inactive.ts) - trener wie, dlaczego kogoś nie ma.
export async function reportAbsencePeriodAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const until = String(formData.get("until") ?? "");
  const returnTo = readReturnTo(formData);

  const session = await requireMemberAccess(memberId);
  if (!isAbsenceReason(reason)) throw new Error("Nieprawidłowy powód.");

  const now = new Date();
  const { freeCancellationHours } = await getClubSettings();
  const range = resolveAbsenceRangeEnd({ until, now, toUtc: zonedTimeToUtc });
  if ("error" in range) {
    redirect(withError(returnTo, `ABSENCE_${range.error}`));
  }

  const affected = await prisma.booking.findMany({
    where: {
      memberId,
      status: { in: ["BOOKED", "WAITLIST"] },
      session: { startsAt: { gte: now, lt: range.endsAt }, status: { not: "CANCELLED" } },
    },
    include: { session: true },
  });

  await prisma.$transaction(async (tx) => {
    const report = await tx.absenceReport.create({
      data: {
        memberId,
        reason,
        note: note || null,
        expectedReturnAt: range.endsAt,
      },
    });

    let lostEntries = 0;
    for (const booking of affected) {
      const outcome =
        booking.status === "WAITLIST"
          ? "CANCELLED"
          : resolveAbsenceOutcome(booking.session.startsAt, now, freeCancellationHours);

      const chargedPassId =
        outcome === "NO_SHOW"
          ? await decrementPassEntryIfLimited(tx, memberId, booking.session.kind)
          : null;
      if (outcome === "NO_SHOW") lostEntries++;

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: outcome,
          cancelledAt: now,
          waitlistPosition: null,
          absenceReason: reason,
          cancellationNote: note || null,
          absenceReportId: report.id,
          chargedPassId,
        },
      });

      if (booking.status === "BOOKED") {
        await promoteFromWaitlist(tx, booking.sessionId);
      }
    }

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "ABSENCE_REPORTED",
      memberId,
      summary: `Zgłoszono przerwę (${ABSENCE_REASON_LABEL[reason]}) do ${formatDate(new Date(range.endsAt.getTime() - 1))} - odwołano ${affected.length} zajęć${lostEntries > 0 ? `, przepadło wejść: ${lostEntries}` : ""}`,
    });
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
  const { freeCancellationHours } = await getClubSettings();
  const wasBooked = booking.status === "BOOKED";
  const outcome =
    booking.status === "WAITLIST"
      ? "CANCELLED"
      : resolveCancellationOutcome(booking.session.startsAt, now, freeCancellationHours);

  await prisma.$transaction(async (tx) => {
    // Spóźnione odwołanie = NO_SHOW = wejście przepada, dokładnie jak przy
    // realnej obecności (SPEC.md sekcja 2). Zapisujemy karnet, z którego
    // zeszło wejście, żeby trener mógł je precyzyjnie zwrócić.
    const chargedPassId =
      outcome === "NO_SHOW"
        ? await decrementPassEntryIfLimited(tx, booking.memberId, booking.session.kind)
        : null;

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: outcome, cancelledAt: now, waitlistPosition: null, chargedPassId },
    });

    // Zwolnione miejsce (odwołanie na czas lub spóźnione, oba fizycznie
    // zwalniają miejsce przed zajęciami) - awans z listy rezerwowej w tej
    // samej transakcji, żeby dwie osoby nie weszły na jedno miejsce.
    if (wasBooked) {
      await promoteFromWaitlist(tx, booking.sessionId);
    }
  });

  redirect(returnTo);
}
