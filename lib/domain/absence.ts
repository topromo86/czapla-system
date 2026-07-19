// Czyste funkcje zgłaszania nieobecności.
//
// Reguła nadrzędna (wariant C, ustalony z klientem): zgłoszenie nieobecności
// NIE omija zasady 4 godzin. Odwołanie na mniej niż 4h przed startem kosztuje
// wejście dokładnie tak samo jak zwykłe odwołanie - inaczej "kontuzja" byłaby
// darmowym wyjściem z każdego spóźnionego odwołania i nikt by tego nie
// weryfikował. Trener widzi powód i może wejście zwrócić ręcznie
// (refundEntryAction) - decyzję podejmuje człowiek, który zna sytuację.

import { canCancelFree, resolveCancellationOutcome } from "@/lib/domain/booking";

export type AbsenceReason = "INJURY" | "OTHER";

export const ABSENCE_REASON_LABEL: Record<AbsenceReason, string> = {
  INJURY: "Kontuzja",
  OTHER: "Inny powód",
};

export function isAbsenceReason(value: string): value is AbsenceReason {
  return value === "INJURY" || value === "OTHER";
}

export type AffectedBooking = {
  id: string;
  sessionName: string;
  startsAt: Date;
};

export type AbsenceImpactEntry = {
  booking: AffectedBooking;
  // true = odwołanie bezkosztowe, false = wejście przepadnie (NO_SHOW).
  free: boolean;
};

export type AbsenceImpact = {
  entries: AbsenceImpactEntry[];
  freeCount: number;
  costlyCount: number;
};

// Podgląd "co się stanie, jak potwierdzę" - pokazywany zanim klient kliknie.
// Bez tego przerwa do wybranej daty byłaby skokiem w ciemno: nie wiadomo, ile
// zajęć zniknie i które z nich kosztują wejście.
export function summarizeAbsenceImpact(
  bookings: readonly AffectedBooking[],
  now: Date,
): AbsenceImpact {
  const entries = bookings
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((booking) => ({ booking, free: canCancelFree(booking.startsAt, now) }));

  return {
    entries,
    freeCount: entries.filter((e) => e.free).length,
    costlyCount: entries.filter((e) => !e.free).length,
  };
}

// Ta sama funkcja co przy zwykłym odwołaniu - świadomie, żeby reguła istniała
// w jednym miejscu i nie rozjechała się między ścieżkami.
export const resolveAbsenceOutcome = resolveCancellationOutcome;

export type AbsenceRangeError = "INVALID_DATE" | "DATE_IN_THE_PAST" | "RANGE_TOO_LONG";

// Maksymalna długość zgłoszonej przerwy. Dłuższa nieobecność to już rozmowa
// z klubem (zamrożenie karnetu), a nie formularz w apce.
export const MAX_ABSENCE_DAYS = 90;

// Koniec przerwy jako moment (wyłącznie): północ dnia PO wskazanej dacie, żeby
// zajęcia w ostatnim dniu przerwy też zostały odwołane.
export function resolveAbsenceRangeEnd(input: {
  until: string; // "2026-08-15"
  now: Date;
  toUtc: (year: number, month: number, day: number, hour: number, minute: number) => Date;
  maxDays?: number;
}): { endsAt: Date } | { error: AbsenceRangeError } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.until.trim());
  if (!match) return { error: "INVALID_DATE" };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { error: "INVALID_DATE" };

  const startOfDayAfter = new Date(Date.UTC(year, month - 1, day + 1));
  if (Number.isNaN(startOfDayAfter.getTime())) return { error: "INVALID_DATE" };

  const endsAt = input.toUtc(
    startOfDayAfter.getUTCFullYear(),
    startOfDayAfter.getUTCMonth() + 1,
    startOfDayAfter.getUTCDate(),
    0,
    0,
  );

  if (endsAt <= input.now) return { error: "DATE_IN_THE_PAST" };

  const maxDays = input.maxDays ?? MAX_ABSENCE_DAYS;
  const spanDays = (endsAt.getTime() - input.now.getTime()) / 86_400_000;
  if (spanDays > maxDays) return { error: "RANGE_TOO_LONG" };

  return { endsAt };
}
