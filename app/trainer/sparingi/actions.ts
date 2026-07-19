"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember, requireTrainerSelf } from "@/lib/auth/guard";

// Dopuszczenie do sparingu (SPEC.md sekcja 2 "Dobór par sparingowych") -
// świadoma decyzja trenera, nie domyślny stan. Odwołuje się tak samo prosto.
export async function toggleSparringClearanceAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const { trainer } = await requireTrainerSelf();
  await requireOwnsMember(memberId);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.member.update({
    where: { id: memberId },
    data: member.sparringClearedAt
      ? { sparringClearedAt: null, sparringClearedByTrainerId: null }
      : { sparringClearedAt: new Date(), sparringClearedByTrainerId: trainer.id },
  });

  revalidatePath("/trainer/sparingi");
}
