"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { sellPass } from "@/lib/services/pass";
import type { PaymentMethod } from "@/app/generated/prisma/client";

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BLIK", "TRANSFER"];

// Sprzedaż karnetu przez trenera - jedyne miejsce w systemie, gdzie odhacza
// się płatność (patrz lib/services/pass.ts#sellPass). requireOwnsMember
// pilnuje, żeby trener sprzedawał wyłącznie własnym podopiecznym.
export async function sellPassAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const planId = String(formData.get("planId"));
  const locationId = String(formData.get("locationId"));
  const method = String(formData.get("method"));

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  await prisma.$transaction((tx) =>
    sellPass(tx, {
      memberId,
      planId,
      locationId,
      method: method as PaymentMethod,
      actorUserId: session.user.id,
      now: new Date(),
    }),
  );

  revalidatePath("/trainer/kasa");
}
