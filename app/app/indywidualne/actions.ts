"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { canCancelFree } from "@/lib/domain/booking";
import { bookIndividualTraining, IndividualBookingError } from "@/lib/services/individual-training";
import { getClubSettings } from "@/lib/services/settings";
import { decrementPassEntryIfLimited } from "@/lib/services/pass";

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

  try {
    await bookIndividualTraining({
      memberId,
      trainerId,
      startsAt,
      actorUserId: session.user.id,
    });
  } catch (cause) {
    if (cause instanceof IndividualBookingError) back(cause.message);
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
      await decrementPassEntryIfLimited(tx, booking.memberId, "INDIVIDUAL");
    });
  }

  revalidatePath("/app/indywidualne");
  revalidatePath("/app");
  back();
}
