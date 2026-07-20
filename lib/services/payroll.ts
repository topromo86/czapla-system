import "server-only";
import { prisma } from "@/lib/prisma";
import {
  monthRange,
  summarizePayout,
  type PayoutSummary,
  type PayrollSession,
  type RateEntry,
} from "@/lib/domain/payroll";

// Zajęcia, za które płacimy TEMU trenerowi w danym miesiącu.
//
// Kluczowe: liczy się ten, kto realnie prowadził. Przy zastępstwie zajęcia
// idą do zastępującego, nie do właściciela wpisu w grafiku - ta sama reguła
// co przy ocenach w lib/jobs/compute-scores.ts.
export async function trainerSessionsForMonth(
  trainerId: string,
  year: number,
  month: number,
): Promise<PayrollSession[]> {
  const { startsAt, endsAt } = monthRange(year, month);

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: startsAt, lt: endsAt },
      OR: [{ trainerId, substituteTrainerId: null }, { substituteTrainerId: trainerId }],
    },
    select: { id: true, kind: true, startsAt: true, endsAt: true, status: true },
    orderBy: { startsAt: "asc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    kind: s.kind,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
  }));
}

export async function trainerRates(trainerId: string): Promise<RateEntry[]> {
  const rates = await prisma.trainerRate.findMany({
    where: { trainerId },
    orderBy: { validFrom: "desc" },
  });
  return rates.map((r) => ({ kind: r.kind, amountGross: r.amountGross, validFrom: r.validFrom }));
}

export async function trainerPayout(
  trainerId: string,
  year: number,
  month: number,
  now: Date,
): Promise<PayoutSummary> {
  const [sessions, rates] = await Promise.all([
    trainerSessionsForMonth(trainerId, year, month),
    trainerRates(trainerId),
  ]);
  return summarizePayout({ sessions, rates, now });
}
