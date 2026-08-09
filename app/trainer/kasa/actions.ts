"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { sellPass, recordPassPayment, SaleError } from "@/lib/services/pass";
import type { PaymentMethod } from "@/app/generated/prisma/client";

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BLIK", "TRANSFER"];

// Kwota z pola "zł" (klub wpisuje 150 albo 150,50) na grosze. Zwraca null, gdy
// pole jest puste - wywołujący decyduje, czy to znaczy "całość", czy błąd.
function zlToGrosze(raw: string): number | null {
  const trimmed = raw.replace(",", ".").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

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

  // Puste pole kwoty = klient płaci całość. Wpisana kwota pozwala przyjąć
  // zaliczkę i zostawić resztę do dopłaty.
  const rawAmount = String(formData.get("amount") ?? "");
  const paidGross = zlToGrosze(rawAmount);

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const back: (params: Record<string, string>) => never = (params) => {
    const query = new URLSearchParams(params);
    if (q) query.set("q", q);
    redirect(`/trainer/kasa?${query.toString()}`);
  };

  if (rawAmount.trim() && paidGross === null) back({ error: "Podaj poprawną kwotę wpłaty." });

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
        paidGross: paidGross ?? undefined,
      }),
    );
  } catch (e) {
    // Zły kod/karta/kwota: pokazujemy komunikat zamiast generycznego 500.
    // Inne błędy (np. brak planu) lecą dalej.
    if (e instanceof SaleError) back({ error: e.message });
    throw e;
  }

  revalidatePath("/trainer/kasa");
  back({ ok: "1" });
}

// Dopłata do karnetu z zaległością - klient wraca i wyrównuje resztę.
export async function recordPaymentAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const passId = String(formData.get("passId"));
  const locationId = String(formData.get("locationId"));
  const method = String(formData.get("method"));
  const q = String(formData.get("q") ?? "").trim();
  const amountGross = zlToGrosze(String(formData.get("amount") ?? ""));

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const back: (params: Record<string, string>) => never = (params) => {
    const query = new URLSearchParams(params);
    if (q) query.set("q", q);
    redirect(`/trainer/kasa?${query.toString()}`);
  };

  if (amountGross === null) back({ error: "Podaj kwotę wpłaty." });

  try {
    await prisma.$transaction((tx) =>
      recordPassPayment(tx, {
        passId,
        amountGross,
        method: method as PaymentMethod,
        locationId,
        actorUserId: session.user.id,
        now: new Date(),
      }),
    );
  } catch (e) {
    if (e instanceof SaleError) back({ error: e.message });
    throw e;
  }

  revalidatePath("/trainer/kasa");
  back({ ok: "1" });
}
