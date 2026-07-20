// Czyste funkcje wynagrodzenia trenera i kosztów klubu.
//
// Wszystkie kwoty w groszach (CLAUDE.md) - nigdy Float, bo to są pieniądze
// wypłacane realnym ludziom.
//
// Granice miesiąca liczone w czasie klubu (Europe/Warsaw), nie w UTC serwera:
// zajęcia o 23:30 ostatniego dnia miesiąca muszą wpaść do TEGO miesiąca, a nie
// do następnego przez przesunięcie strefy.

import { zonedTimeToUtc, type CalendarDate } from "@/lib/domain/time";

export type SessionKind = "GROUP" | "INDIVIDUAL";

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  GROUP: "Grupowe",
  INDIVIDUAL: "Indywidualne",
};

// Zakres miesiąca kalendarzowego jako momenty UTC: [start, koniec).
export function monthRange(year: number, month: number): { startsAt: Date; endsAt: Date } {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    startsAt: zonedTimeToUtc(year, month, 1, 0, 0),
    endsAt: zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0),
  };
}

export type RateEntry = {
  kind: SessionKind;
  amountGross: number;
  validFrom: Date;
};

// Stawka obowiązująca w danym momencie: najpóźniejsza, która zaczęła
// obowiązywać nie później niż wtedy. Dzięki temu podwyżka od 1 sierpnia nie
// zmienia tego, co trener zarobił w lipcu.
export function rateAt(
  rates: readonly RateEntry[],
  kind: SessionKind,
  at: Date,
): number | null {
  const applicable = rates
    .filter((rate) => rate.kind === kind && rate.validFrom <= at)
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  return applicable[0]?.amountGross ?? null;
}

export type PayrollSession = {
  id: string;
  kind: SessionKind;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type KindSummary = {
  kind: SessionKind;
  doneCount: number;
  doneMinutes: number;
  upcomingCount: number;
  upcomingMinutes: number;
  // Stawka na dziś - do pokazania "ile płacimy za jedne zajęcia".
  currentRateGross: number | null;
  earnedGross: number;
  forecastGross: number;
};

export type PayoutSummary = {
  byKind: KindSummary[];
  doneCount: number;
  doneMinutes: number;
  upcomingCount: number;
  upcomingMinutes: number;
  earnedGross: number;
  forecastGross: number;
  totalGross: number;
  // Zajęcia bez ustawionej stawki - liczone jako 0 zł, ale właściciel MUSI
  // o nich wiedzieć, inaczej cicho zaniży wypłatę.
  sessionsWithoutRate: number;
};

function minutesOf(session: PayrollSession): number {
  return Math.max(0, Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000));
}

// Odwołane zajęcia nie liczą się do niczego: nie odbyły się, więc nie ma za co
// płacić ani czego prognozować.
function isCountable(session: PayrollSession): boolean {
  return session.status !== "CANCELLED";
}

export function summarizePayout(input: {
  sessions: readonly PayrollSession[];
  rates: readonly RateEntry[];
  now: Date;
}): PayoutSummary {
  const kinds: SessionKind[] = ["GROUP", "INDIVIDUAL"];
  let sessionsWithoutRate = 0;

  const byKind = kinds.map<KindSummary>((kind) => {
    const ofKind = input.sessions.filter((s) => s.kind === kind && isCountable(s));
    const done = ofKind.filter((s) => s.startsAt <= input.now);
    const upcoming = ofKind.filter((s) => s.startsAt > input.now);

    // Stawka liczona per zajęcia, wg daty ICH startu - nie wg dzisiejszej.
    const sumWithRates = (list: PayrollSession[]) =>
      list.reduce((sum, session) => {
        const rate = rateAt(input.rates, kind, session.startsAt);
        if (rate == null) {
          sessionsWithoutRate++;
          return sum;
        }
        return sum + rate;
      }, 0);

    return {
      kind,
      doneCount: done.length,
      doneMinutes: done.reduce((sum, s) => sum + minutesOf(s), 0),
      upcomingCount: upcoming.length,
      upcomingMinutes: upcoming.reduce((sum, s) => sum + minutesOf(s), 0),
      currentRateGross: rateAt(input.rates, kind, input.now),
      earnedGross: sumWithRates(done),
      forecastGross: sumWithRates(upcoming),
    };
  });

  const earnedGross = byKind.reduce((sum, k) => sum + k.earnedGross, 0);
  const forecastGross = byKind.reduce((sum, k) => sum + k.forecastGross, 0);

  return {
    byKind,
    doneCount: byKind.reduce((sum, k) => sum + k.doneCount, 0),
    doneMinutes: byKind.reduce((sum, k) => sum + k.doneMinutes, 0),
    upcomingCount: byKind.reduce((sum, k) => sum + k.upcomingCount, 0),
    upcomingMinutes: byKind.reduce((sum, k) => sum + k.upcomingMinutes, 0),
    earnedGross,
    forecastGross,
    totalGross: earnedGross + forecastGross,
    sessionsWithoutRate,
  };
}

// "12 godz. 30 min" - trener pyta o godziny, nie o minuty.
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} godz.`;
  return `${hours} godz. ${minutes} min`;
}

export type CostKind = "RECURRING_MONTHLY" | "ONE_OFF";

export type CostEntry = {
  id: string;
  name: string;
  amountGross: number;
  kind: CostKind;
  startsOn: Date;
  endsOn: Date | null;
};

// Czy koszt obciąża wskazany miesiąc. Stały: od miesiąca startowego do
// końcowego włącznie (null = nadal). Jednorazowy: tylko w swoim miesiącu.
export function costAppliesToMonth(cost: CostEntry, year: number, month: number): boolean {
  const monthKey = year * 12 + (month - 1);
  const startKey = cost.startsOn.getUTCFullYear() * 12 + cost.startsOn.getUTCMonth();

  if (cost.kind === "ONE_OFF") return monthKey === startKey;

  if (monthKey < startKey) return false;
  if (cost.endsOn == null) return true;
  const endKey = cost.endsOn.getUTCFullYear() * 12 + cost.endsOn.getUTCMonth();
  return monthKey <= endKey;
}

export function sumCostsForMonth(
  costs: readonly CostEntry[],
  year: number,
  month: number,
): { recurringGross: number; oneOffGross: number; totalGross: number } {
  const applicable = costs.filter((cost) => costAppliesToMonth(cost, year, month));
  const recurringGross = applicable
    .filter((c) => c.kind === "RECURRING_MONTHLY")
    .reduce((sum, c) => sum + c.amountGross, 0);
  const oneOffGross = applicable
    .filter((c) => c.kind === "ONE_OFF")
    .reduce((sum, c) => sum + c.amountGross, 0);
  return { recurringGross, oneOffGross, totalGross: recurringGross + oneOffGross };
}

// Etykieta miesiąca "2026-07" -> do porównań i adresów URL.
export function monthKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}`;
}

export function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

const MONTH_NAMES = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

export function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}
