"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { markJoinedIfNeeded } from "@/lib/services/member";
import type { PaymentMethod } from "@/app/generated/prisma/client";

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BLIK", "TRANSFER"];

// Sprzedaż karnetu (SPEC.md sekcja 2 "Sprzedaż karnetu"): Pass + Payment w
// jednej transakcji. Lokalizacja to gdzie fizycznie przyjęto pieniądze -
// niekoniecznie lokalizacja domowa klienta (stąd osobne pole w formularzu).
export async function assignPassAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const planId = String(formData.get("planId"));
  const locationId = String(formData.get("locationId"));
  const method = String(formData.get("method"));

  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const [plan, currentActivePass] = await Promise.all([
    prisma.plan.findUniqueOrThrow({ where: { id: planId } }),
    prisma.pass.findFirst({
      where: { memberId, status: "ACTIVE" },
      orderBy: { endsAt: "desc" },
    }),
  ]);

  const now = new Date();
  // Jeśli klient ma jeszcze aktywny karnet - nowy startuje od endsAt starego,
  // nie od dziś (SPEC.md sekcja 2: "inaczej okradasz klienta z dni").
  const startsAt =
    currentActivePass && currentActivePass.endsAt > now ? currentActivePass.endsAt : now;
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);

  await prisma.$transaction(async (tx) => {
    const pass = await tx.pass.create({
      data: {
        memberId,
        planId,
        startsAt,
        endsAt,
        entriesLeft: plan.entriesPerMonth,
        status: "ACTIVE",
        soldByUserId: session.user.id,
      },
    });

    await tx.payment.create({
      data: {
        memberId,
        passId: pass.id,
        amountGross: plan.priceGross,
        method: method as PaymentMethod,
        locationId,
        recordedByUserId: session.user.id,
      },
    });

    // Pierwsza opłacona transakcja = joinedAt, jeśli klient jeszcze nie dołączył.
    await markJoinedIfNeeded(tx, memberId, now);
  });

  redirect("/admin");
}
