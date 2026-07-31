"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { createPromoCode, sellGiftCard } from "@/lib/services/discount";
import { zonedTimeToUtc } from "@/lib/domain/time";
import type { DiscountKind } from "@/lib/domain/discount";
import type { PaymentMethod } from "@/app/generated/prisma/client";

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "BLIK", "TRANSFER"];

function back(error?: string): never {
  redirect(error ? `/admin/promocje?error=${encodeURIComponent(error)}` : "/admin/promocje?ok=1");
}

// Kwota z pola "zł" (może z przecinkiem) na grosze.
function zlToGrosze(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Data z pola <input type=date> jako północ (albo koniec dnia) czasu klubu.
function parseDay(raw: string, endOfDay = false): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return zonedTimeToUtc(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
  );
}

export async function createPromoCodeAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const code = String(formData.get("code") ?? "");
  const kind = String(formData.get("kind") ?? "") as DiscountKind;
  if (kind !== "PERCENT" && kind !== "AMOUNT") back("Wybierz typ rabatu.");

  const rawValue = String(formData.get("value") ?? "").trim();
  const value = kind === "AMOUNT" ? zlToGrosze(rawValue) : Number(rawValue);
  if (value === null || !Number.isFinite(value)) back("Podaj poprawną wartość rabatu.");

  const planId = String(formData.get("planId") ?? "").trim() || null;
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    back("Limit użyć musi być liczbą większą od zera albo pusty.");
  }

  const validFrom = String(formData.get("validFrom") ?? "").trim();
  const validUntil = String(formData.get("validUntil") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await createPromoCode(prisma, {
    code,
    kind,
    value: value as number,
    planId,
    maxUses,
    validFrom: validFrom ? parseDay(validFrom) : null,
    validUntil: validUntil ? parseDay(validUntil, true) : null,
    note,
    actorUserId: session.user.id,
  });
  if (!result.ok) back(result.error);

  revalidatePath("/admin/promocje");
  back();
}

export async function deactivatePromoCodeAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await prisma.promoCode.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin/promocje");
  back();
}

export async function sellGiftCardAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const buyerMemberId = String(formData.get("buyerMemberId") ?? "").trim();
  if (!buyerMemberId) back("Wybierz kupującego (klienta).");

  const value = zlToGrosze(String(formData.get("value") ?? ""));
  if (value === null) back("Podaj poprawną wartość karty.");

  const method = String(formData.get("method") ?? "");
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) back("Wybierz metodę płatności.");

  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!locationId) back("Wybierz miejsce.");

  const validUntil = String(formData.get("validUntil") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await sellGiftCard(prisma, {
    buyerMemberId,
    valueGross: value,
    method: method as PaymentMethod,
    locationId,
    validUntil: validUntil ? parseDay(validUntil, true) : null,
    note,
    actorUserId: session.user.id,
  });
  if (!result.ok) back(result.error);

  revalidatePath("/admin/promocje");
  redirect(`/admin/promocje?nowaKarta=${encodeURIComponent(result.code)}`);
}

export async function deactivateGiftCardAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await prisma.giftCard.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin/promocje");
  back();
}
