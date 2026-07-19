import "server-only";
import { Prisma, type PrismaClient, type PaymentMethod } from "@/app/generated/prisma/client";
import { markJoinedIfNeeded } from "./member";
import { logActivity } from "./activity";
import { formatMoney } from "@/lib/format";

type Tx = PrismaClient | Prisma.TransactionClient;

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

  // Jeśli klient ma jeszcze aktywny karnet - nowy startuje od endsAt starego,
  // nie od dziś (SPEC.md sekcja 2: "inaczej okradasz klienta z dni").
  const startsAt =
    currentActivePass && currentActivePass.endsAt > params.now ? currentActivePass.endsAt : params.now;
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

  await tx.payment.create({
    data: {
      memberId: params.memberId,
      passId: pass.id,
      amountGross: plan.priceGross,
      method: params.method,
      locationId: params.locationId,
      recordedByUserId: params.actorUserId,
    },
  });

  // Pierwsza opłacona transakcja = joinedAt, jeśli klient jeszcze nie dołączył.
  await markJoinedIfNeeded(tx, params.memberId, params.now);

  await logActivity(tx, {
    actorUserId: params.actorUserId,
    action: "PASS_SOLD",
    memberId: params.memberId,
    summary: `Sprzedano karnet "${plan.name}" (${formatMoney(plan.priceGross)}) klientowi ${member.firstName} ${member.lastName}`,
  });

  return pass;
}
