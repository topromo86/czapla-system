"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { closeCashDay } from "@/lib/jobs/close-cash-day";
import { todayInTimeZone } from "@/lib/domain/time";

// Poza nocnym cronem - pozwala właścicielowi przeliczyć "oczekiwane" dla
// dzisiejszego dnia od ręki (np. przed fizycznym przeliczeniem kasy).
export async function refreshTodayCashDayAction() {
  await requireRole("ADMIN");
  await closeCashDay(prisma, todayInTimeZone(new Date()));
  revalidatePath("/admin/kasa");
}

export async function closeCashDayReconcileAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const cashDayId = String(formData.get("cashDayId"));
  const countedGrossZl = Number(formData.get("countedGross"));
  const discrepancyNote = String(formData.get("discrepancyNote") ?? "").trim();

  if (!Number.isFinite(countedGrossZl) || countedGrossZl < 0) {
    throw new Error("Podaj poprawną policzoną kwotę.");
  }

  const cashDay = await prisma.cashDay.findUniqueOrThrow({ where: { id: cashDayId } });
  const countedGross = Math.round(countedGrossZl * 100);

  // Rozbieżność wymaga notatki (CLAUDE.md: bez tego kasa w dwóch lokalizacjach
  // rozjedzie się w miesiąc).
  if (countedGross !== cashDay.expectedGross && discrepancyNote.length < 5) {
    throw new Error("Rozbieżność między kwotą oczekiwaną a policzoną wymaga notatki.");
  }

  await prisma.cashDay.update({
    where: { id: cashDayId },
    data: {
      countedGross,
      discrepancyNote: discrepancyNote || null,
      closedByUserId: session.user.id,
      closedAt: new Date(),
    },
  });

  revalidatePath("/admin/kasa");
}
