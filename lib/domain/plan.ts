// Rodzaje karnetów: co klub sprzedaje i za ile.
//
// Karnet opisują trzy rzeczy: jak długo jest ważny (durationDays), ile ma
// wejść (entriesPerMonth; null = OPEN, czyli bez limitu) i ile kosztuje.
// Reszta to nazwa i to, czy dotyczy dzieci.
//
// Nazwa pola `entriesPerMonth` jest historyczna - przy sprzedaży trafia wprost
// do `Pass.entriesLeft`, więc znaczy po prostu "wejścia w tym karnecie".
// W interfejsie mówimy "liczba wejść", bo tak to działa.

import { plural } from "./polish";

export const PLAN_PERIODS = [
  { days: 30, label: "Miesięczny" },
  { days: 90, label: "Kwartalny" },
  { days: 180, label: "Półroczny" },
  { days: 365, label: "Roczny" },
] as const;

// Górny limit długości karnetu. Nie ma karnetów na dekadę, a literówka
// (3650 zamiast 365) potrafiłaby dać komuś dożywotni wstęp.
export const MAX_PLAN_DURATION_DAYS = 1095;

export type PlanInput = {
  name: string;
  priceGross: number;
  durationDays: number;
  entriesPerMonth: number | null;
};

export type PlanValidationError =
  "NAME_REQUIRED" | "INVALID_PRICE" | "INVALID_DURATION" | "INVALID_ENTRIES";

export const PLAN_ERROR_MESSAGE: Record<PlanValidationError, string> = {
  NAME_REQUIRED: "Podaj nazwę karnetu.",
  INVALID_PRICE: "Podaj cenę - liczbę nieujemną, np. 249 albo 249,50.",
  INVALID_DURATION: `Podaj ważność w dniach: od 1 do ${MAX_PLAN_DURATION_DAYS}.`,
  INVALID_ENTRIES: "Liczba wejść musi być dodatnia. Zostaw puste dla karnetu OPEN.",
};

export function validatePlan(input: PlanInput): PlanValidationError | null {
  if (input.name.trim().length === 0) return "NAME_REQUIRED";
  if (!Number.isInteger(input.priceGross) || input.priceGross < 0) return "INVALID_PRICE";
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < 1 ||
    input.durationDays > MAX_PLAN_DURATION_DAYS
  ) {
    return "INVALID_DURATION";
  }
  if (
    input.entriesPerMonth !== null &&
    (!Number.isInteger(input.entriesPerMonth) || input.entriesPerMonth < 1)
  ) {
    return "INVALID_ENTRIES";
  }
  return null;
}

// "Miesięczny" dla typowych okresów, "45 dni" dla nietypowych. Klub ma prawo
// wymyślić karnet wakacyjny na 45 dni i nie musi go nazywać kwartalnym.
export function periodLabel(days: number): string {
  return PLAN_PERIODS.find((p) => p.days === days)?.label ?? `${days} dni`;
}

// Bez tego cennik pisze "24 wejść", co w polskim tekście po prostu razi.
export function entriesWord(count: number): string {
  return plural(count, { one: "wejście", few: "wejścia", many: "wejść" });
}

export function entriesLabel(entriesPerMonth: number | null): string {
  if (entriesPerMonth == null) return "bez limitu wejść";
  return `${entriesPerMonth} ${entriesWord(entriesPerMonth)}`;
}

// Jednolinijkowy opis karnetu na listę: "Miesięczny · 8 wejść · 179 zł".
export function describePlan(plan: {
  durationDays: number;
  entriesPerMonth: number | null;
  priceGross: number;
}): string {
  const zl = (plan.priceGross / 100).toFixed(2).replace(".", ",").replace(",00", "");
  return `${periodLabel(plan.durationDays)} · ${entriesLabel(plan.entriesPerMonth)} · ${zl} zł`;
}
