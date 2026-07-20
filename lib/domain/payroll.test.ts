import { describe, expect, it } from "vitest";
import {
  costAppliesToMonth,
  formatMinutes,
  formatMonth,
  monthKey,
  monthRange,
  parseMonthKey,
  rateAt,
  sumCostsForMonth,
  summarizePayout,
  type CostEntry,
  type PayrollSession,
  type RateEntry,
} from "./payroll";

function warsaw(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

function session(
  id: string,
  kind: "GROUP" | "INDIVIDUAL",
  startsAt: string,
  minutes = 60,
  status = "SCHEDULED",
): PayrollSession {
  const start = new Date(startsAt);
  return {
    id,
    kind,
    startsAt: start,
    endsAt: new Date(start.getTime() + minutes * 60_000),
    status,
  };
}

describe("monthRange", () => {
  it("obejmuje cały lipiec w czasie klubu", () => {
    const { startsAt, endsAt } = monthRange(2026, 7);
    expect(warsaw(startsAt)).toBe("2026-07-01 00:00");
    expect(warsaw(endsAt)).toBe("2026-08-01 00:00");
  });

  it("przechodzi przez granicę roku", () => {
    const { startsAt, endsAt } = monthRange(2026, 12);
    expect(warsaw(startsAt)).toBe("2026-12-01 00:00");
    expect(warsaw(endsAt)).toBe("2027-01-01 00:00");
  });

  it("działa w czasie zimowym (UTC+1)", () => {
    const { startsAt } = monthRange(2026, 1);
    expect(warsaw(startsAt)).toBe("2026-01-01 00:00");
  });
});

describe("rateAt", () => {
  const rates: RateEntry[] = [
    { kind: "GROUP", amountGross: 8000, validFrom: new Date("2026-01-01T00:00:00Z") },
    { kind: "GROUP", amountGross: 10000, validFrom: new Date("2026-07-01T00:00:00Z") },
    { kind: "INDIVIDUAL", amountGross: 15000, validFrom: new Date("2026-01-01T00:00:00Z") },
  ];

  it("bierze stawkę obowiązującą w danym momencie", () => {
    expect(rateAt(rates, "GROUP", new Date("2026-06-15T10:00:00Z"))).toBe(8000);
    expect(rateAt(rates, "GROUP", new Date("2026-07-15T10:00:00Z"))).toBe(10000);
  });

  it("stawka obowiązuje od dokładnie swojego momentu", () => {
    expect(rateAt(rates, "GROUP", new Date("2026-07-01T00:00:00Z"))).toBe(10000);
  });

  it("nie miesza rodzajów zajęć", () => {
    expect(rateAt(rates, "INDIVIDUAL", new Date("2026-07-15T10:00:00Z"))).toBe(15000);
  });

  it("null, gdy stawka jeszcze nie obowiązywała", () => {
    expect(rateAt(rates, "GROUP", new Date("2025-12-31T23:00:00Z"))).toBeNull();
  });

  it("null dla rodzaju bez żadnej stawki", () => {
    expect(rateAt([], "GROUP", new Date())).toBeNull();
  });
});

describe("summarizePayout", () => {
  const rates: RateEntry[] = [
    { kind: "GROUP", amountGross: 10000, validFrom: new Date("2026-07-01T00:00:00Z") },
    { kind: "INDIVIDUAL", amountGross: 15000, validFrom: new Date("2026-07-01T00:00:00Z") },
  ];
  const now = new Date("2026-07-15T12:00:00Z");

  it("dzieli zajęcia na odbyte i zaplanowane", () => {
    const summary = summarizePayout({
      now,
      rates,
      sessions: [
        session("a", "GROUP", "2026-07-05T16:00:00Z"),
        session("b", "GROUP", "2026-07-20T16:00:00Z"),
        session("c", "INDIVIDUAL", "2026-07-10T16:00:00Z"),
      ],
    });

    expect(summary.doneCount).toBe(2);
    expect(summary.upcomingCount).toBe(1);
    expect(summary.earnedGross).toBe(10000 + 15000);
    expect(summary.forecastGross).toBe(10000);
    expect(summary.totalGross).toBe(35000);
  });

  it("odwołane zajęcia nie liczą się ani do wypłaty, ani do prognozy", () => {
    const summary = summarizePayout({
      now,
      rates,
      sessions: [
        session("a", "GROUP", "2026-07-05T16:00:00Z", 60, "CANCELLED"),
        session("b", "GROUP", "2026-07-20T16:00:00Z", 60, "CANCELLED"),
      ],
    });

    expect(summary.doneCount).toBe(0);
    expect(summary.upcomingCount).toBe(0);
    expect(summary.totalGross).toBe(0);
  });

  // Sedno historii stawek: podwyżka nie przelicza wstecz.
  it("każde zajęcia płacone stawką z dnia ICH startu", () => {
    const withRaise: RateEntry[] = [
      { kind: "GROUP", amountGross: 8000, validFrom: new Date("2026-07-01T00:00:00Z") },
      { kind: "GROUP", amountGross: 12000, validFrom: new Date("2026-07-10T00:00:00Z") },
    ];
    const summary = summarizePayout({
      now,
      rates: withRaise,
      sessions: [
        session("przed", "GROUP", "2026-07-05T16:00:00Z"),
        session("po", "GROUP", "2026-07-12T16:00:00Z"),
      ],
    });

    expect(summary.earnedGross).toBe(8000 + 12000);
  });

  it("liczy minuty odbyte i zaplanowane osobno", () => {
    const summary = summarizePayout({
      now,
      rates,
      sessions: [
        session("a", "GROUP", "2026-07-05T16:00:00Z", 90),
        session("b", "GROUP", "2026-07-20T16:00:00Z", 45),
      ],
    });

    expect(summary.doneMinutes).toBe(90);
    expect(summary.upcomingMinutes).toBe(45);
  });

  it("zgłasza zajęcia bez ustawionej stawki zamiast cicho liczyć zero", () => {
    const summary = summarizePayout({
      now,
      rates: [],
      sessions: [session("a", "GROUP", "2026-07-05T16:00:00Z")],
    });

    expect(summary.sessionsWithoutRate).toBe(1);
    expect(summary.earnedGross).toBe(0);
  });

  it("rozbija wynik na rodzaje zajęć", () => {
    const summary = summarizePayout({
      now,
      rates,
      sessions: [
        session("a", "GROUP", "2026-07-05T16:00:00Z"),
        session("c", "INDIVIDUAL", "2026-07-10T16:00:00Z"),
      ],
    });

    const group = summary.byKind.find((k) => k.kind === "GROUP")!;
    const individual = summary.byKind.find((k) => k.kind === "INDIVIDUAL")!;
    expect(group.earnedGross).toBe(10000);
    expect(individual.earnedGross).toBe(15000);
    expect(group.currentRateGross).toBe(10000);
  });

  it("brak zajęć daje zera, nie błąd", () => {
    const summary = summarizePayout({ now, rates, sessions: [] });
    expect(summary.totalGross).toBe(0);
    expect(summary.byKind).toHaveLength(2);
  });
});

describe("costAppliesToMonth", () => {
  function cost(overrides: Partial<CostEntry> = {}): CostEntry {
    return {
      id: "c1",
      name: "Czynsz",
      amountGross: 300000,
      kind: "RECURRING_MONTHLY",
      startsOn: new Date(Date.UTC(2026, 0, 1)),
      endsOn: null,
      ...overrides,
    };
  }

  it("stały koszt obowiązuje od miesiąca startowego w nieskończoność", () => {
    expect(costAppliesToMonth(cost(), 2026, 1)).toBe(true);
    expect(costAppliesToMonth(cost(), 2027, 5)).toBe(true);
  });

  it("stały koszt nie obowiązuje przed miesiącem startowym", () => {
    expect(costAppliesToMonth(cost(), 2025, 12)).toBe(false);
  });

  it("stały koszt z datą końcową obowiązuje do niej włącznie", () => {
    const ended = cost({ endsOn: new Date(Date.UTC(2026, 5, 30)) });
    expect(costAppliesToMonth(ended, 2026, 6)).toBe(true);
    expect(costAppliesToMonth(ended, 2026, 7)).toBe(false);
  });

  it("koszt jednorazowy obciąża wyłącznie swój miesiąc", () => {
    const oneOff = cost({ kind: "ONE_OFF", startsOn: new Date(Date.UTC(2026, 6, 15)) });
    expect(costAppliesToMonth(oneOff, 2026, 7)).toBe(true);
    expect(costAppliesToMonth(oneOff, 2026, 8)).toBe(false);
    expect(costAppliesToMonth(oneOff, 2026, 6)).toBe(false);
  });
});

describe("sumCostsForMonth", () => {
  const costs: CostEntry[] = [
    {
      id: "1",
      name: "Czynsz",
      amountGross: 300000,
      kind: "RECURRING_MONTHLY",
      startsOn: new Date(Date.UTC(2026, 0, 1)),
      endsOn: null,
    },
    {
      id: "2",
      name: "Worki",
      amountGross: 120000,
      kind: "ONE_OFF",
      startsOn: new Date(Date.UTC(2026, 6, 10)),
      endsOn: null,
    },
    {
      id: "3",
      name: "Stary abonament",
      amountGross: 50000,
      kind: "RECURRING_MONTHLY",
      startsOn: new Date(Date.UTC(2026, 0, 1)),
      endsOn: new Date(Date.UTC(2026, 4, 31)),
    },
  ];

  it("sumuje stałe i jednorazowe osobno", () => {
    const result = sumCostsForMonth(costs, 2026, 7);
    expect(result.recurringGross).toBe(300000);
    expect(result.oneOffGross).toBe(120000);
    expect(result.totalGross).toBe(420000);
  });

  it("pomija koszty spoza miesiąca", () => {
    const result = sumCostsForMonth(costs, 2026, 8);
    expect(result.oneOffGross).toBe(0);
    expect(result.recurringGross).toBe(300000);
  });

  it("uwzględnia zakończony koszt stały tylko w jego okresie", () => {
    expect(sumCostsForMonth(costs, 2026, 3).recurringGross).toBe(350000);
    expect(sumCostsForMonth(costs, 2026, 6).recurringGross).toBe(300000);
  });
});

describe("formatMinutes", () => {
  it("formatuje godziny i minuty", () => {
    expect(formatMinutes(90)).toBe("1 godz. 30 min");
    expect(formatMinutes(120)).toBe("2 godz.");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(0)).toBe("0 min");
  });
});

describe("monthKey / parseMonthKey", () => {
  it("buduje i czyta klucz miesiąca", () => {
    expect(monthKey({ year: 2026, month: 7, day: 20 })).toBe("2026-07");
    expect(parseMonthKey("2026-07")).toEqual({ year: 2026, month: 7 });
  });

  it("odrzuca niepoprawny klucz", () => {
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("lipiec")).toBeNull();
  });
});

describe("formatMonth", () => {
  it("nazywa miesiąc po polsku", () => {
    expect(formatMonth(2026, 7)).toBe("lipiec 2026");
  });
});
