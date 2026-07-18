"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// Karnet minimum (PLAN.md Faza 1): właściciel ręcznie zakłada karnet, żeby
// warunek rezerwacji miał na czym stać. Pełna "Kasa" z płatnościami - Faza 3.
export async function assignPassAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const planId = String(formData.get("planId"));

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

  await prisma.pass.create({
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

  redirect("/admin");
}
