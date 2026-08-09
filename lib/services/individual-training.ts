import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildSlots, findSlot, findSlotAt } from "@/lib/domain/availability";
import { evaluateBookingEligibility } from "@/lib/domain/booking";
import { loadClubAvailability } from "@/lib/services/availability";
import { logActivity } from "@/lib/services/activity";
import { formatDayTime } from "@/lib/format";

// Zapis na trening indywidualny - jedna procedura dla dwóch wejść: klient
// umawia się sam z aplikacji, trener umawia go ze swojego panelu (bo klient
// zadzwonił). Reguły są identyczne i mają takie zostać, więc nie ma dwóch
// kopii, które z czasem się rozjadą.

export class IndividualBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndividualBookingError";
  }
}

const REJECTION_MESSAGE: Record<string, string> = {
  SESSION_CANCELLED: "Ten termin został odwołany.",
  ALREADY_STARTED: "Ten termin już minął.",
  MISSING_CONSENTS: "Najpierw uzupełnij zgody w zakładce Zgody.",
  CONSENTS_NOT_DELIVERED:
    "Dostarcz podpisane zgody trenerowi lub w recepcji - do potwierdzenia odbioru dostępne są tylko pierwsze zajęcia.",
  NO_ACTIVE_PASS: "Do zapisu potrzebny jest aktywny karnet.",
  AGE_NOT_ELIGIBLE: "Ten trening nie jest dostępny dla tego wieku.",
};

export type BookIndividualInput = {
  memberId: string;
  trainerId: string;
  startsAt: Date;
  // Kto klika - do dziennika aktywności.
  actorUserId: string;
  // true, gdy zapisuje trener w imieniu klienta. Zmienia wyłącznie treść
  // wpisu w dzienniku; reguły zapisu zostają te same.
  onBehalfOfMember?: boolean;
  now?: Date;
};

// Rzuca IndividualBookingError z gotowym komunikatem po polsku, kiedy zapis
// jest niemożliwy. Wszystko inne leci wyżej jako prawdziwy błąd.
export async function bookIndividualTraining(input: BookIndividualInput): Promise<void> {
  const now = input.now ?? new Date();
  const { memberId, trainerId, startsAt } = input;

  const { windows, busy } = await loadClubAvailability(now);

  // Sedno bezpieczeństwa: żądany termin musi znaleźć się na liście WOLNYCH
  // slotów wyliczonej z okien trenera i zajętości sal. Godzina spoza okien
  // (np. 23:00) na tej liście nie istnieje, a godzina z zajętą salą jest na
  // niej oznaczona jako zablokowana - jedno i drugie odpada tutaj, niezależnie
  // od tego, co przyszło z formularza.
  const slots = buildSlots({ windows, busy, now });
  const slot = findSlot(slots, trainerId, startsAt);
  if (!slot) {
    const blocked = findSlotAt(slots, trainerId, startsAt);
    throw new IndividualBookingError(
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
  // reguła 9. Dotyczy też zapisu przez trenera: gdyby trener mógł ominąć
  // karnet i zgody, cała reguła byłaby na niby.
  const eligibility = evaluateBookingEligibility({
    now,
    memberApproved: member.approvalStatus === "APPROVED",
    consentsDelivered: member.consentsDeliveredAt != null,
    hasOtherActiveBooking: otherActiveBookings > 0,
    memberBirthDate: member.birthDate,
    memberIsMinor: member.isMinor,
    grantedConsentKeys: new Set(consents.map((c) => c.consentType.key)),
    activePass,
    session: { startsAt: slot.startsAt, capacity: 1, status: "SCHEDULED" },
    bookedCount: 0,
  });

  if (!eligibility.ok) {
    throw new IndividualBookingError(
      REJECTION_MESSAGE[eligibility.reason] ?? "Nie można zapisać się na ten termin.",
    );
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
        actorUserId: input.actorUserId,
        action: "INDIVIDUAL_SESSION_BOOKED",
        memberId,
        summary: input.onBehalfOfMember
          ? `Trener zapisał ${member.firstName} ${member.lastName} na trening indywidualny z ${trainer.user.name} (${formatDayTime(slot.startsAt)})`
          : `Zapis na trening indywidualny z ${trainer.user.name} (${formatDayTime(slot.startsAt)})`,
      });
    });
  } catch (cause) {
    // Częściowe unikalne indeksy (trainerId, startsAt) i (locationId, startsAt)
    // dla INDIVIDUAL - dwie osoby kliknęły ten sam wolny termin (u tego samego
    // trenera albo u dwóch różnych w tej samej sali) w tej samej chwili.
    // Przegrany dostaje zrozumiały komunikat zamiast błędu bazy.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      throw new IndividualBookingError("Ktoś właśnie zajął ten termin. Wybierz inny.");
    }
    throw cause;
  }
}
