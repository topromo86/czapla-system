"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { buildSlots, findSlot, findSlotAt } from "@/lib/domain/availability";
import { canCancelFree, evaluateBookingEligibility } from "@/lib/domain/booking";
import { loadClubAvailability } from "@/lib/services/availability";
import { getClubSettings } from "@/lib/services/settings";
import { logActivity } from "@/lib/services/activity";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";
import { formatDayTime } from "@/lib/format";

const REJECTION_MESSAGE: Record<string, string> = {
  SESSION_CANCELLED: "Ten termin został odwołany.",
  ALREADY_STARTED: "Ten termin już minął.",
  MISSING_CONSENTS: "Najpierw uzupełnij zgody w zakładce Zgody.",
  CONSENTS_NOT_DELIVERED:
    "Dostarcz podpisane zgody trenerowi lub w recepcji - do potwierdzenia odbioru dostępne są tylko pierwsze zajęcia.",
  NO_ACTIVE_PASS: "Do zapisu potrzebny jest aktywny karnet.",
  AGE_NOT_ELIGIBLE: "Ten trening nie jest dostępny dla tego wieku.",
};

function back(error?: string): never {
  redirect(error ? `/app/indywidualne?error=${encodeURIComponent(error)}` : "/app/indywidualne");
}

export async function bookIndividualSlotAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const trainerId = String(formData.get("trainerId") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");

  const session = await requireMemberAccess(memberId);

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) back("Nieprawidłowy termin.");

  const now = new Date();

  const { windows, busy } = await loadClubAvailability(now);

  // Sedno bezpieczeństwa: żądany termin musi znaleźć się na liście WOLNYCH
  // slotów wyliczonej z okien trenera i zajętości sal. Godzina spoza okien
  // (np. 23:00) po prostu na tej liście nie istnieje, a godzina, w której sala
  // jest zajęta, jest na niej oznaczona jako zablokowana - jedno i drugie
  // odpada tutaj, niezależnie od tego, co przyszło z formularza.
  const slots = buildSlots({ windows, busy, now });
  const slot = findSlot(slots, trainerId, startsAt);
  if (!slot) {
    const blocked = findSlotAt(slots, trainerId, startsAt);
    back(
      blocked?.blockedBy === "ROOM_BUSY"
        ? "O tej godzinie sala jest już zajęta. Wybierz inny termin albo drugą lokalizację."
        : "Ten termin nie jest już dostępny. Wybierz inny z listy.",
    );
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  const [consents, activePass, otherActiveBookings] = await Promise.all([
    prisma.consent.findMany({
      where: { memberId, revokedAt: null },
      include: { consentType: true },
    }),
    prisma.pass.findFirst({ where: { memberId, status: "ACTIVE" }, orderBy: { endsAt: "desc" } }),
    prisma.booking.count({ where: { memberId, status: { not: "CANCELLED" } } }),
  ]);

  // Ten sam komplet reguł co przy zajęciach grupowych (zgody, karnet, wiek,
  // dostarczone zgody) - trening indywidualny nie jest furtką obok CLAUDE.md
  // reguła 9.
  const eligibility = evaluateBookingEligibility({
    now,
    memberApproved: member.approvalStatus === "APPROVED",
    consentsDelivered: member.consentsDeliveredAt != null,
    hasOtherActiveBooking: otherActiveBookings > 0,
    memberBirthDate: member.birthDate,
    memberIsMinor: member.isMinor,
    grantedConsentKeys: new Set(consents.map((c) => c.consentType.key)),
    activePass,
    session: {
      startsAt: slot.startsAt,
      capacity: 1,
      status: "SCHEDULED",
    },
    bookedCount: 0,
  });

  if (!eligibility.ok) {
    back(REJECTION_MESSAGE[eligibility.reason] ?? "Nie można zapisać się na ten termin.");
  }

  const [trainer, individualCategory] = await Promise.all([
    prisma.trainer.findUniqueOrThrow({ where: { id: trainerId }, include: { user: true } }),
    // Rodzaj oznaczony jako "automatyczny dla indywidualnych" - dzięki temu
    // trening trafia do właściwego filtra w plannerze bez pytania klienta.
    prisma.classCategory.findFirst({ where: { isIndividual: true } }),
  ]);

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          locationId: slot.locationId,
          trainerId,
          categoryId: individualCategory?.id ?? null,
          name: `Trening indywidualny - ${trainer.user.name}`,
          kind: "INDIVIDUAL",
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          capacity: 1,
        },
      });

      await tx.booking.create({
        data: { sessionId: created.id, memberId, status: "BOOKED" },
      });

      await logActivity(tx, {
        actorUserId: session.user.id,
        action: "INDIVIDUAL_SESSION_BOOKED",
        memberId,
        summary: `Zapis na trening indywidualny z ${trainer.user.name} (${formatDayTime(slot.startsAt)})`,
      });
    });
  } catch (cause) {
    // Częściowe unikalne indeksy (trainerId, startsAt) i (locationId, startsAt)
    // dla INDIVIDUAL - dwie osoby kliknęły ten sam wolny termin (u tego samego
    // trenera albo u dwóch różnych w tej samej sali) w tej samej chwili.
    // Przegrany dostaje zrozumiały komunikat zamiast błędu bazy.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      back("Ktoś właśnie zajął ten termin. Wybierz inny.");
    }
    throw cause;
  }

  revalidatePath("/app/indywidualne");
  revalidatePath("/app");
  back();
}

export async function cancelIndividualSlotAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { session: true },
  });
  await requireMemberAccess(booking.memberId);

  if (booking.session.kind !== "INDIVIDUAL") {
    back("Ten zapis nie jest treningiem indywidualnym.");
  }

  // Te same zasady co przy zajęciach grupowych (SPEC.md sekcja 2): odwołanie
  // na czas jest bezkosztowe, spóźnione kosztuje wejście. Bez tego trening
  // indywidualny byłby furtką - można by odwoływać pięć minut przed czasem
  // bez żadnych konsekwencji, blokując trenerowi termin.
  const { freeCancellationHours } = await getClubSettings();

  if (canCancelFree(booking.session.startsAt, new Date(), freeCancellationHours)) {
    // Kasujemy całą sesję, nie tylko rezerwację - inaczej pusty trening
    // indywidualny blokowałby slot innym klientom.
    await prisma.session.delete({ where: { id: booking.sessionId } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "NO_SHOW", cancelledAt: new Date() },
      });
      await tx.session.update({
        where: { id: booking.sessionId },
        data: {
          status: "CANCELLED",
          cancelledReason: `Odwołane przez klienta mniej niż ${freeCancellationHours} godz. przed startem`,
        },
      });
      await decrementPassEntryIfLimited(tx, booking.memberId);
    });
  }

  revalidatePath("/app/indywidualne");
  revalidatePath("/app");
  back();
}
