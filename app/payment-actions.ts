"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { sellPass, recordPassPayment, SaleError } from "@/lib/services/pass";
import type { PaymentMethod } from "@/app/generated/prisma/client";

// Przyjmowanie wpłat działa w dwóch miejscach: u trenera na sali i w panelu
// właściciela. Akcje są wspólne, bo reguły rozliczenia są te same - różni je
// wyłącznie ekran, na który wracamy po zapisie.
//
// requireOwnsMember pilnuje dostępu: ADMIN (właściciel i superadmin) przechodzi
// do każdego klienta, trener wyłącznie do swoich podopiecznych.

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BLIK", "TRANSFER"];

// Adres powrotu bierzemy z formularza, więc musi być z listy - inaczej dałoby
// się podstawić cudzy adres i wyprowadzić użytkownika z aplikacji.
const RETURN_PATHS = ["/trainer/kasa", "/admin/wplaty"] as const;

function safeReturnTo(raw: string): string {
  return (RETURN_PATHS as readonly string[]).includes(raw) ? raw : "/trainer/kasa";
}

// Kwota z pola "zł" (klub wpisuje 150 albo 150,50) na grosze. Zwraca null, gdy
// pole jest puste - wywołujący decyduje, czy to znaczy "całość", czy błąd.
function zlToGrosze(raw: string): number | null {
  const trimmed = raw.replace(",", ".").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Powrót na ekran z komunikatem. Typ `never` to nie ozdoba: dzięki jawnej
// adnotacji przy `const back: Back = ...` TypeScript wie, że po wywołaniu
// wykonanie się kończy, i zawęża typy poniżej (bez adnotacji na zmiennej
// zawężanie nie działa).
type Back = (params: Record<string, string>) => never;

function makeBack(returnTo: string, q: string): Back {
  return (params) => {
    const query = new URLSearchParams(params);
    if (q) query.set("q", q);
    redirect(`${returnTo}?${query.toString()}`);
  };
}

// Sprzedaż karnetu wraz z wpłatą. Puste pole kwoty = klient płaci całość;
// kwota niższa tworzy karnet z zaległością widoczną na liście.
export async function sellPassAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const planId = String(formData.get("planId"));
  const locationId = String(formData.get("locationId"));
  const method = String(formData.get("method"));
  const promoCode = String(formData.get("promoCode") ?? "").trim() || null;
  const giftCardCode = String(formData.get("giftCardCode") ?? "").trim() || null;
  const q = String(formData.get("q") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));

  const rawAmount = String(formData.get("amount") ?? "");
  const paidGross = zlToGrosze(rawAmount);

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const back: Back = makeBack(returnTo, q);
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

  revalidatePath(returnTo);
  back({ ok: "1" });
}

// Dopłata do karnetu z zaległością - klient wraca i wyrównuje resztę.
export async function recordPaymentAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const passId = String(formData.get("passId"));
  const locationId = String(formData.get("locationId"));
  const method = String(formData.get("method"));
  const q = String(formData.get("q") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));
  const amountGross = zlToGrosze(String(formData.get("amount") ?? ""));

  const session = await requireOwnsMember(memberId);
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    throw new Error("Nieprawidłowa metoda płatności.");
  }

  const back: Back = makeBack(returnTo, q);
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

  revalidatePath(returnTo);
  back({ ok: "1" });
}
