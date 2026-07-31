// Rabaty (kody promocyjne) i karty podarunkowe - czysta logika, bez bazy.
//
// Zasada rozliczenia:
//   cena_planu --(kod rabatowy)--> cena_do_zaplaty --(karta podarunkowa)--> gotówka
// Payment.amountGross to gotówka realnie pobrana (po rabacie i po odjęciu karty).
// Sprzedaż karty podarunkowej jest osobnym przychodem - realizacja to już tylko
// wykorzystanie opłaconego kredytu, więc nie liczy się drugi raz do utargu.

export type DiscountKind = "PERCENT" | "AMOUNT";

// Kody wpisuje się na telefonie, na sali - bez rozróżniania wielkości liter i
// spacji. Normalizujemy tak samo przy tworzeniu i przy realizacji.
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Ile złotówek (groszy) schodzi z ceny.
export function discountAmount(priceGross: number, kind: DiscountKind, value: number): number {
  if (priceGross <= 0) return 0;
  if (kind === "PERCENT") return Math.round((priceGross * clampPercent(value)) / 100);
  return Math.max(0, Math.min(priceGross, Math.round(value)));
}

// Cena po rabacie - nigdy poniżej zera.
export function discountedPrice(priceGross: number, kind: DiscountKind, value: number): number {
  return Math.max(0, priceGross - discountAmount(priceGross, kind, value));
}

export type PromoValidationError =
  "INACTIVE" | "NOT_STARTED" | "EXPIRED" | "USED_UP" | "WRONG_PLAN";

export const PROMO_ERROR_MESSAGE: Record<PromoValidationError, string> = {
  INACTIVE: "Kod jest nieaktywny.",
  NOT_STARTED: "Kod jeszcze nie obowiązuje.",
  EXPIRED: "Kod stracił ważność.",
  USED_UP: "Kod osiągnął limit użyć.",
  WRONG_PLAN: "Kod nie obejmuje wybranego karnetu.",
};

export type PromoLike = {
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
  planId: string | null;
};

// Czy kod można użyć do sprzedaży danego planu w danym momencie.
export function validatePromoCode(
  promo: PromoLike,
  ctx: { planId: string; now: Date },
): PromoValidationError | null {
  if (!promo.active) return "INACTIVE";
  if (promo.validFrom && ctx.now < promo.validFrom) return "NOT_STARTED";
  if (promo.validUntil && ctx.now > promo.validUntil) return "EXPIRED";
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return "USED_UP";
  if (promo.planId && promo.planId !== ctx.planId) return "WRONG_PLAN";
  return null;
}

// Walidacja wartości kodu przy zakładaniu (formularz admina).
export function validatePromoValue(kind: DiscountKind, value: number): string | null {
  if (!Number.isInteger(value)) return "Wartość rabatu musi być liczbą całkowitą.";
  if (kind === "PERCENT" && (value < 1 || value > 100)) {
    return "Rabat procentowy musi mieścić się w zakresie 1-100.";
  }
  if (kind === "AMOUNT" && value < 1) return "Kwota rabatu musi być większa od zera.";
  return null;
}

export type GiftCardError = "INACTIVE" | "EXPIRED" | "NO_BALANCE";

export const GIFT_CARD_ERROR_MESSAGE: Record<GiftCardError, string> = {
  INACTIVE: "Karta jest nieaktywna.",
  EXPIRED: "Karta straciła ważność.",
  NO_BALANCE: "Karta nie ma już środków.",
};

export type GiftCardLike = {
  active: boolean;
  validUntil: Date | null;
  balanceGross: number;
};

export function validateGiftCard(card: GiftCardLike, now: Date): GiftCardError | null {
  if (!card.active) return "INACTIVE";
  if (card.validUntil && now > card.validUntil) return "EXPIRED";
  if (card.balanceGross <= 0) return "NO_BALANCE";
  return null;
}

// Ile karta pokrywa, ile zostaje do dopłaty gotówką i ile środków zostaje na
// karcie. Karta pokrywa maksymalnie tyle, ile wynosi kwota do zapłaty.
export function applyGiftCard(
  payableGross: number,
  balanceGross: number,
): { applied: number; remaining: number; balanceLeft: number } {
  const applied = Math.max(0, Math.min(Math.max(0, payableGross), Math.max(0, balanceGross)));
  return {
    applied,
    remaining: Math.max(0, payableGross) - applied,
    balanceLeft: Math.max(0, balanceGross) - applied,
  };
}
