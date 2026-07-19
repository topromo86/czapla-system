"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// Brak realnej wysyłki ankiety mailem (ta sama luka co SMS w Fazie 4 - brak
// podpiętego dostawcy poczty). ChurnSurvey powstaje automatycznie w jobie
// churnAndSurvey; odpowiedź wpisuje tu admin/trener po rozmowie z klientem,
// zamiast czekać na link z maila, który i tak by nie poszedł.
export async function answerChurnSurveyAction(formData: FormData) {
  await requireRole("ADMIN");
  const churnSurveyId = String(formData.get("churnSurveyId"));
  const reasonId = String(formData.get("reasonId"));
  const comment = String(formData.get("comment") ?? "").trim();

  await prisma.churnSurvey.update({
    where: { id: churnSurveyId },
    data: {
      reasonId: reasonId || null,
      comment: comment || null,
      answeredAt: new Date(),
    },
  });

  revalidatePath("/admin/powody-odejsc");
}
