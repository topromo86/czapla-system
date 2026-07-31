import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type PrismaClient, type PaymentMethod } from "@/app/generated/prisma/client";
import {
  applyGiftCard,
  discountAmount,
  discountedPrice,
  normalizeCode,
  validateGiftCard,
  validatePromoCode,
  validatePromoValue,
  GIFT_CARD_ERROR_MESSAGE,
  PROMO_ERROR_MESSAGE,
  type DiscountKind,
} from "@/lib/domain/discount";
import { logActivity } from "./activity";
import { formatMoney } from "@/lib/format";

type Db = PrismaClient | Prisma.TransactionClient;

// Alfabet bez znaków mylących (0/O, 1/I/L) - kod czyta się z papierowego bonu.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateGiftCardCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `GC-${block()}-${block()}`;
}

export async function createPromoCode(
  db: Db,
  params: {
    code: string;
    kind: DiscountKind;
    value: number;
    planId: string | null;
    maxUses: number | null;
    validFrom: Date | null;
    validUntil: Date | null;
    note: string | null;
    actorUserId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = normalizeCode(params.code);
  if (code.length < 3) return { ok: false, error: "Kod musi mieć co najmniej 3 znaki." };

  const valueError = validatePromoValue(params.kind, params.value);
  if (valueError) return { ok: false, error: valueError };

  const existing = await db.promoCode.findUnique({ where: { code } });
  if (existing) return { ok: false, error: "Kod o tej nazwie już istnieje." };

  await db.promoCode.create({
    data: {
      code,
      kind: params.kind,
      value: params.value,
      planId: params.planId,
      maxUses: params.maxUses,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      note: params.note,
      createdByUserId: params.actorUserId,
    },
  });

  await logActivity(db, {
    actorUserId: params.actorUserId,
    action: "PROMO_CODE_CREATED",
    summary: `Utworzono kod rabatowy ${code}`,
  });

  return { ok: true };
}

// Sprzedaż karty podarunkowej: powstaje karta z pełnym saldem oraz Payment
// (przychód) przypisany do kupującego. Przychód liczy się TERAZ - realizacja
// karty przy karnecie to już tylko wykorzystanie opłaconego kredytu.
export async function sellGiftCard(
  db: Db,
  params: {
    buyerMemberId: string;
    valueGross: number;
    method: PaymentMethod;
    locationId: string;
    validUntil: Date | null;
    note: string | null;
    actorUserId: string;
  },
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  if (!Number.isInteger(params.valueGross) || params.valueGross < 100) {
    return { ok: false, error: "Wartość karty musi być kwotą co najmniej 1 zł." };
  }

  // Kolizja kodu jest skrajnie mało prawdopodobna, ale sprawdzamy - unikat i tak
  // pilnuje baza, tu tylko ładny komunikat zamiast 500.
  let code = generateGiftCardCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.giftCard.findUnique({ where: { code } });
    if (!clash) break;
    code = generateGiftCardCode();
  }

  const payment = await db.payment.create({
    data: {
      memberId: params.buyerMemberId,
      amountGross: params.valueGross,
      method: params.method,
      locationId: params.locationId,
      recordedByUserId: params.actorUserId,
      note: `Sprzedaż karty podarunkowej ${code}`,
    },
  });

  await db.giftCard.create({
    data: {
      code,
      initialGross: params.valueGross,
      balanceGross: params.valueGross,
      validUntil: params.validUntil,
      note: params.note,
      createdByUserId: params.actorUserId,
      soldPaymentId: payment.id,
    },
  });

  await logActivity(db, {
    actorUserId: params.actorUserId,
    action: "GIFT_CARD_SOLD",
    memberId: params.buyerMemberId,
    summary: `Sprzedano kartę podarunkową ${code} (${formatMoney(params.valueGross)})`,
  });

  return { ok: true, code };
}

export type SaleQuote = {
  planPriceGross: number;
  discountGross: number;
  priceAfterDiscount: number;
  giftApplied: number;
  giftBalanceLeft: number | null;
  cashDue: number;
  promoLabel: string | null;
  promoError: string | null;
  giftLabel: string | null;
  giftError: string | null;
};

// Podgląd ceny dla kasy - tylko odczyt, bez zmian w bazie. Ta sama matematyka co
// w sellPass (przez domenę), więc podgląd i realna sprzedaża się zgadzają.
export async function quoteSale(
  db: Db,
  params: { planId: string; promoCode?: string | null; giftCardCode?: string | null; now: Date },
): Promise<SaleQuote> {
  const plan = await db.plan.findUniqueOrThrow({ where: { id: params.planId } });

  let discountGross = 0;
  let promoLabel: string | null = null;
  let promoError: string | null = null;

  const promoRaw = params.promoCode?.trim();
  if (promoRaw) {
    const promo = await db.promoCode.findUnique({ where: { code: normalizeCode(promoRaw) } });
    if (!promo) {
      promoError = "Nie znaleziono takiego kodu rabatowego.";
    } else {
      const err = validatePromoCode(promo, { planId: params.planId, now: params.now });
      if (err) {
        promoError = PROMO_ERROR_MESSAGE[err];
      } else {
        discountGross = discountAmount(plan.priceGross, promo.kind, promo.value);
        promoLabel =
          promo.kind === "PERCENT"
            ? `${promo.code}: -${promo.value}%`
            : `${promo.code}: -${formatMoney(promo.value)}`;
      }
    }
  }

  const priceAfterDiscount = discountedPrice(plan.priceGross, "AMOUNT", discountGross);

  let giftApplied = 0;
  let giftBalanceLeft: number | null = null;
  let giftLabel: string | null = null;
  let giftError: string | null = null;

  const giftRaw = params.giftCardCode?.trim();
  if (giftRaw) {
    const card = await db.giftCard.findUnique({ where: { code: normalizeCode(giftRaw) } });
    if (!card) {
      giftError = "Nie znaleziono takiej karty podarunkowej.";
    } else {
      const err = validateGiftCard(card, params.now);
      if (err) {
        giftError = GIFT_CARD_ERROR_MESSAGE[err];
      } else {
        const res = applyGiftCard(priceAfterDiscount, card.balanceGross);
        giftApplied = res.applied;
        giftBalanceLeft = res.balanceLeft;
        giftLabel = `${card.code}: -${formatMoney(giftApplied)} (zostaje ${formatMoney(res.balanceLeft)})`;
      }
    }
  }

  return {
    planPriceGross: plan.priceGross,
    discountGross,
    priceAfterDiscount,
    giftApplied,
    giftBalanceLeft,
    cashDue: priceAfterDiscount - giftApplied,
    promoLabel,
    promoError,
    giftLabel,
    giftError,
  };
}
