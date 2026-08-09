import { describe, expect, it } from "vitest";
import {
  describePlan,
  entriesLabel,
  entriesWord,
  MAX_PLAN_DURATION_DAYS,
  periodLabel,
  validatePlan,
} from "./plan";

const base = { name: "OPEN Dorośli", priceGross: 24900, durationDays: 30, entriesPerMonth: null };

describe("validatePlan", () => {
  it("przyjmuje poprawny karnet OPEN", () => {
    expect(validatePlan(base)).toBeNull();
  });

  it("przyjmuje karnet na wejścia", () => {
    expect(validatePlan({ ...base, entriesPerMonth: 8 })).toBeNull();
  });

  it("wymaga nazwy", () => {
    expect(validatePlan({ ...base, name: "   " })).toBe("NAME_REQUIRED");
  });

  // Karnet za 0 zł to nie błąd - tak wygląda wejście na trening próbny.
  it("dopuszcza cenę zero", () => {
    expect(validatePlan({ ...base, priceGross: 0 })).toBeNull();
  });

  it("odrzuca cenę ujemną", () => {
    expect(validatePlan({ ...base, priceGross: -1 })).toBe("INVALID_PRICE");
  });

  it("odrzuca ważność spoza zakresu", () => {
    expect(validatePlan({ ...base, durationDays: 0 })).toBe("INVALID_DURATION");
    expect(validatePlan({ ...base, durationDays: MAX_PLAN_DURATION_DAYS + 1 })).toBe(
      "INVALID_DURATION",
    );
    expect(validatePlan({ ...base, durationDays: 1.5 })).toBe("INVALID_DURATION");
  });

  it("odrzuca zerową i ujemną liczbę wejść", () => {
    expect(validatePlan({ ...base, entriesPerMonth: 0 })).toBe("INVALID_ENTRIES");
    expect(validatePlan({ ...base, entriesPerMonth: -3 })).toBe("INVALID_ENTRIES");
  });

  it("roczny karnet przechodzi", () => {
    expect(validatePlan({ ...base, durationDays: 365, priceGross: 249000 })).toBeNull();
  });
});

describe("periodLabel", () => {
  it("nazywa typowe okresy", () => {
    expect(periodLabel(30)).toBe("Miesięczny");
    expect(periodLabel(90)).toBe("Kwartalny");
    expect(periodLabel(180)).toBe("Półroczny");
    expect(periodLabel(365)).toBe("Roczny");
  });

  it("nietypowy okres podaje w dniach", () => {
    expect(periodLabel(45)).toBe("45 dni");
  });
});

describe("entriesWord", () => {
  it("odmienia po polsku", () => {
    expect(entriesWord(1)).toBe("wejście");
    expect(entriesWord(2)).toBe("wejścia");
    expect(entriesWord(4)).toBe("wejścia");
    expect(entriesWord(5)).toBe("wejść");
    expect(entriesWord(8)).toBe("wejść");
    expect(entriesWord(21)).toBe("wejść");
    expect(entriesWord(24)).toBe("wejścia");
  });

  // Nastki są wyjątkiem: 12, 13, 14 mimo końcówki 2-4 biorą "wejść".
  it("nastki biorą dopełniacz", () => {
    expect(entriesWord(12)).toBe("wejść");
    expect(entriesWord(13)).toBe("wejść");
    expect(entriesWord(14)).toBe("wejść");
    expect(entriesWord(112)).toBe("wejść");
  });
});

describe("entriesLabel", () => {
  it("OPEN nie ma limitu", () => {
    expect(entriesLabel(null)).toBe("bez limitu wejść");
  });

  it("karnet na wejścia podaje liczbę z odmianą", () => {
    expect(entriesLabel(8)).toBe("8 wejść");
    expect(entriesLabel(4)).toBe("4 wejścia");
    expect(entriesLabel(1)).toBe("1 wejście");
  });
});

describe("describePlan", () => {
  it("składa opis karnetu", () => {
    expect(describePlan({ durationDays: 30, entriesPerMonth: 8, priceGross: 17900 })).toBe(
      "Miesięczny · 8 wejść · 179 zł",
    );
  });

  it("pokazuje grosze, gdy są", () => {
    expect(describePlan({ durationDays: 365, entriesPerMonth: null, priceGross: 249050 })).toBe(
      "Roczny · bez limitu wejść · 2490,50 zł",
    );
  });
});
