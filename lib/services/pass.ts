import "server-only";
import { Prisma, type PrismaClient, type PaymentMethod } from "@/app/generated/prisma/client";
import { markJoinedIfNeeded } from "./member";
import { logActivity } from "./activity";
import { formatMoney } from "@/lib/format";
import {
  applyGiftCard,
  discountedPrice,
  normalizeCode,
  validateGiftCard,
  validatePromoCode,
  GIFT_CARD_ERROR_MESSAGE,
  PROMO_ERROR_MESSAGE,
} from "@/lib/domain/discount";

type Tx = PrismaClient | Prisma.TransactionClient;

// Błąd sprzedaży z komunikatem dla klienta (np. zły kod rabatowy). Akcja łapie
// go i pokazuje treść, zamiast wywracać całą transakcję generycznym 500.
export class SaleError extends Error {}

// Zdejmuje jedno wejście z aktywnego karnetu limitowanego klienta. Wywoływane
// dopiero przy realnej obecności (Attendance) albo spóźnionym odwołaniu
// (NO_SHOW) - nigdy przy samej rezerwacji (SPEC.md sekcja 2: "rezerwacja NIE
// zdejmuje wejścia"). Karnety OPEN (entriesLeft null) są pomijane.
//
// Zwraca id karnetu, z którego zeszło wejście (albo null). Wywołujący zapisuje
// je przy rezerwacji, żeby ewentualny zwrot trafił dokładnie tam, skąd wejście
// zeszło - klient mógł w międzyczasie kupić nowy karnet.
export async function decrementPassEntryIfLimited(
  tx: Tx,
  memberId: string,
): Promise<string | null> {
  const pass = await tx.pass.findFirst({
    where: { memberId, status: "ACTIVE" },
    orderBy: { endsAt: "desc" },
  });
  if (pass && pass.entriesLeft != null) {
    await tx.pass.update({ where: { id: pass.id }, data: { entriesLeft: { decrement: 1 } } });
    return pass.id;
  }
  return null;
}

// Zwrot wejścia na konkretny karnet - odwrotność powyższego. Świadomie bez
// sprawdzania, czy karnet jest wciąż aktywny: jeśli trener uznaje, że wejście
// się należy, ma wrócić tam, skąd zeszło, nawet gdy karnet zdążył wygasnąć.
export async function refundPassEntry(tx: Tx, passId: string) {
  const pass = await tx.pass.findUnique({ where: { id: passId } });
  if (pass && pass.entriesLeft != null) {
    await tx.pass.update({ where: { id: passId }, data: { entriesLeft: { increment: 1 } } });
  }
}

// Sprzedaż karnetu (SPEC.md sekcja 2 "Sprzedaż karnetu"): Pass + Payment w
// jednej transakcji. Współdzielone przez ekran admina i ekran „Kasa" trenera -
// gotówka realnie zmienia ręce przy trenerze, na sali, więc to on najczęściej
// wykonuje tę akcję (CLAUDE.md: kasa musi działać w 15 s na telefonie).
export async function sellPass(
  tx: Tx,
  params: {
    memberId: string;
    planId: string;
    locationId: string;
    method: PaymentMethod;
    actorUserId: string;
    now: Date;
    // Opcjonalny kod rabatowy i karta podarunkowa. amountGross to gotówka
    // realnie pobrana - po rabacie i po odjęciu tego, co pokryła karta.
    promoCode?: string | null;
    giftCardCode?: string | null;
  },
) {
  const [plan, currentActivePass, member] = await Promise.all([
    tx.plan.findUniqueOrThrow({ where: { id: params.planId } }),
    tx.pass.findFirst({
      where: { memberId: params.memberId, status: "ACTIVE" },
      orderBy: { endsAt: "desc" },
    }),
    tx.member.findUniqueOrThrow({ where: { id: params.memberId } }),
  ]);

  // 1. Kod rabatowy: obniża cenę planu. Walidacja w transakcji, żeby limit
  //    użyć i termin liczyły się na moment sprzedaży, nie na podgląd wcześniej.
  let priceGross = plan.priceGross;
  let promo = null;
  const promoRaw = params.promoCode?.trim();
  if (promoRaw) {
    promo = await tx.promoCode.findUnique({ where: { code: normalizeCode(promoRaw) } });
    if (!promo) throw new SaleError("Nie znaleziono takiego kodu rabatowego.");
    const err = validatePromoCode(promo, { planId: params.planId, now: params.now });
    if (err) throw new SaleError(PROMO_ERROR_MESSAGE[err]);
    priceGross = discountedPrice(plan.priceGross, promo.kind, promo.value);
  }

  // 2. Karta podarunkowa: pokrywa część (albo całość) należności po rabacie.
  let giftCard = null;
  let giftApplied = 0;
  const giftRaw = params.giftCardCode?.trim();
  if (giftRaw) {
    giftCard = await tx.giftCard.findUnique({ where: { code: normalizeCode(giftRaw) } });
    if (!giftCard) throw new SaleError("Nie znaleziono takiej karty podarunkowej.");
    const err = validateGiftCard(giftCard, params.now);
    if (err) throw new SaleError(GIFT_CARD_ERROR_MESSAGE[err]);
    giftApplied = applyGiftCard(priceGross, giftCard.balanceGross).applied;
  }

  const cashGross = priceGross - giftApplied;

  // Jeśli klient ma jeszcze aktywny karnet - nowy startuje od endsAt starego,
  // nie od dziś (SPEC.md sekcja 2: "inaczej okradasz klienta z dni").
  const startsAt =
    currentActivePass && currentActivePass.endsAt > params.now
      ? currentActivePass.endsAt
      : params.now;
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);

  const pass = await tx.pass.create({
    data: {
      memberId: params.memberId,
      planId: params.planId,
      startsAt,
      endsAt,
      entriesLeft: plan.entriesPerMonth,
      status: "ACTIVE",
      soldByUserId: params.actorUserId,
    },
  });

  const payment = await tx.payment.create({
    data: {
      memberId: params.memberId,
      passId: pass.id,
      amountGross: cashGross,
      method: params.method,
      locationId: params.locationId,
      recordedByUserId: params.actorUserId,
      promoCodeId: promo?.id ?? null,
    },
  });

  // 3. Zapisz zużycie kodu i realizację karty (zmniejsz saldo). Po sprzedaży,
  //    żeby liczyły się tylko przy realnie zawartej transakcji.
  if (promo) {
    await tx.promoCode.update({
      where: { id: promo.id },
      data: { usedCount: { increment: 1 } },
    });
  }
  if (giftCard && giftApplied > 0) {
    await tx.giftCardRedemption.create({
      data: { giftCardId: giftCard.id, paymentId: payment.id, amountGross: giftApplied },
    });
    await tx.giftCard.update({
      where: { id: giftCard.id },
      data: { balanceGross: { decrement: giftApplied } },
    });
  }

  // Pierwsza opłacona transakcja = joinedAt, jeśli klient jeszcze nie dołączył.
  await markJoinedIfNeeded(tx, params.memberId, params.now);

  const parts = [`Sprzedano karnet "${plan.name}" (${formatMoney(cashGross)})`];
  if (promo) parts.push(`kod ${promo.code}`);
  if (giftApplied > 0) parts.push(`karta ${formatMoney(giftApplied)}`);
  await logActivity(tx, {
    actorUserId: params.actorUserId,
    action: "PASS_SOLD",
    memberId: params.memberId,
    summary: `${parts.join(", ")} - klient ${member.firstName} ${member.lastName}`,
  });

  return pass;
}
