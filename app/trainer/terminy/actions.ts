"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { validateWindow, type WindowValidationError } from "@/lib/domain/availability";
import { logActivity } from "@/lib/services/activity";

// Trener sam ustala, kiedy przyjmuje na treningi indywidualne. Właściciel może
// to samo z panelu admina - tu chodzi o to, żeby trener nie musiał go prosić
// o każdą zmianę godzin.
//
// Okno to reguła tygodniowa ("wtorki 16:00-20:00, po 60 min"), a nie konkretny
// termin. Które godziny z tego okna są realnie wolne, liczy się na bieżąco:
// odpadają te, w których trener ma zajęcia grupowe, i te, w których jego sala
// jest zajęta przez kogokolwiek innego.

const WINDOW_ERROR_MESSAGE: Record<WindowValidationError, string> = {
  INVALID_WEEKDAY: "Wybierz dzień tygodnia.",
  INVALID_START_TIME: "Podaj poprawną godzinę rozpoczęcia.",
  INVALID_END_TIME: "Podaj poprawną godzinę zakończenia.",
  END_BEFORE_START: "Godzina zakończenia musi być późniejsza niż rozpoczęcia.",
  INVALID_SLOT_MINUTES: "Wybierz długość treningu.",
  WINDOW_SHORTER_THAN_SLOT: "Okno jest krótsze niż jeden trening - nie zmieści się żaden termin.",
};

function back(error?: string): never {
  redirect(error ? `/trainer/terminy?error=${encodeURIComponent(error)}` : "/trainer/terminy");
}

export async function createMyAvailabilityWindowAction(formData: FormData) {
  const { session, trainer } = await requireTrainerSelf();

  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const slotMinutes = Number(formData.get("slotMinutes"));
  const locationId = String(formData.get("locationId") ?? "");

  const invalid = validateWindow({ weekday, startTime, endTime, slotMinutes });
  if (invalid) back(WINDOW_ERROR_MESSAGE[invalid]);

  // Sala z formularza, ale sprawdzona - trenerzy prowadzą i w Mikołowie,
  // i w Tychach, a od sali zależy, komu ten termin zablokuje matę.
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) back("Wybierz salę.");

  await prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.create({
      data: {
        // Zawsze własne konto - z formularza nie da się podstawić cudzego trenera.
        trainerId: trainer.id,
        locationId: location.id,
        weekday,
        startTime,
        endTime,
        slotMinutes,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "AVAILABILITY_WINDOW_CHANGED",
      summary: `Trener dodał sobie okno treningów indywidualnych (${startTime}-${endTime}, ${location.name})`,
    });
  });

  revalidatePath("/trainer/terminy");
  revalidatePath("/app/indywidualne");
  revalidatePath("/admin/zajecia");
  back();
}

export async function deleteMyAvailabilityWindowAction(formData: FormData) {
  const { session, trainer } = await requireTrainerSelf();
  const windowId = String(formData.get("windowId") ?? "");

  const existing = await prisma.availabilityWindow.findUnique({ where: { id: windowId } });
  if (!existing || existing.trainerId !== trainer.id) {
    back("To okno nie należy do Ciebie.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.delete({ where: { id: windowId } });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "AVAILABILITY_WINDOW_CHANGED",
      summary: `Trener usunął sobie okno treningów indywidualnych (${existing.startTime}-${existing.endTime})`,
    });
  });

  // Usunięcie okna nie kasuje umówionych treningów - to są zobowiązania wobec
  // klientów. Odwołuje się je świadomie na liście zajęć.
  revalidatePath("/trainer/terminy");
  revalidatePath("/app/indywidualne");
  revalidatePath("/admin/zajecia");
  back();
}
