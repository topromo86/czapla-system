"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { sellPass, SaleError } from "@/lib/services/pass";
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
  // Kod rabatowy i karta podarunkowa - opcjonalne. Puste = brak.
  const promoCode = String(formData.get("promoCode") ?? "").trim() || null;
  const giftCardCode = String(formData.get("giftCardCode") ?? "").trim() || null;
  const q = String(formData.get("q") ?? "").trim();

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const back = (params: Record<string, string>): never => {
    const query = new URLSearchParams(params);
    if (q) query.set("q", q);
    redirect(`/trainer/kasa?${query.toString()}`);
  };

  try {
    await prisma.$transaction((tx) =>
      sellPass(tx, {
        memberId,
        planId,
        locationId,
        method: method as PaymentMethod,
        actorUserId: session.user.id,
        now: new Date(),
        promoCode,
        giftCardCode,
      }),
    );
  } catch (e) {
    // Zły kod/karta: pokazujemy komunikat zamiast generycznego 500. Inne błędy
    // (np. brak planu) lecą dalej.
    if (e instanceof SaleError) back({ error: e.message });
    throw e;
  }

  revalidatePath("/trainer/kasa");
  back({ ok: "1" });
}
