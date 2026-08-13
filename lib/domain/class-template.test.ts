import { describe, expect, it } from "vitest";
import {
  parseStartDate,
  resolveClassName,
  validateClassTemplate,
} from "@/lib/domain/class-template";

describe("resolveClassName", () => {
  it("zwraca podaną nazwę, gdy nie jest pusta", () => {
    expect(resolveClassName("Boks - grupa poranna", "Boks")).toBe("Boks - grupa poranna");
  });

  it("przycina białe znaki", () => {
    expect(resolveClassName("  Sparingi  ", "Boks")).toBe("Sparingi");
  });

  it("używa nazwy rodzaju, gdy nazwa pusta", () => {
    expect(resolveClassName("", "Kickboxing")).toBe("Kickboxing");
  });

  it("używa nazwy rodzaju dla samych spacji", () => {
    expect(resolveClassName("   ", "Kickboxing")).toBe("Kickboxing");
  });

  it("używa nazwy rodzaju dla null/undefined", () => {
    expect(resolveClassName(null, "Boks")).toBe("Boks");
    expect(resolveClassName(undefined, "Boks")).toBe("Boks");
  });
});

describe("parseStartDate", () => {
  it("pusty string oznacza od zaraz (null)", () => {
    expect(parseStartDate("")).toBeNull();
    expect(parseStartDate("   ")).toBeNull();
    expect(parseStartDate(undefined)).toBeNull();
  });

  it("parsuje poprawną datę", () => {
    expect(parseStartDate("2026-09-01")).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("odrzuca zły format", () => {
    expect(parseStartDate("01.09.2026")).toBe("INVALID");
    expect(parseStartDate("2026-9-1")).toBe("INVALID");
  });

  it("odrzuca miesiąc/dzień poza zakresem", () => {
    expect(parseStartDate("2026-13-01")).toBe("INVALID");
    expect(parseStartDate("2026-00-10")).toBe("INVALID");
    expect(parseStartDate("2026-05-00")).toBe("INVALID");
    expect(parseStartDate("2026-05-32")).toBe("INVALID");
  });
});

describe("validateClassTemplate", () => {
  const base = { weekday: 1, startTime: "18:00", durationMin: 60, capacity: 16 };

  it("akceptuje poprawny plan bez daty startu", () => {
    const result = validateClassTemplate(base);
    expect(result).toEqual({
      value: { weekday: 1, startTime: "18:00", durationMin: 60, capacity: 16, startDate: null },
    });
  });

  it("normalizuje godzinę do HH:MM", () => {
    const result = validateClassTemplate({ ...base, startTime: "9:05" });
    expect("value" in result && result.value.startTime).toBe("09:05");
  });

  it("przenosi datę startu", () => {
    const result = validateClassTemplate({ ...base, startDate: "2026-09-01" });
    expect("value" in result && result.value.startDate).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
  });

  it("odrzuca zły dzień tygodnia", () => {
    expect(validateClassTemplate({ ...base, weekday: 7 })).toEqual({ error: "INVALID_WEEKDAY" });
    expect(validateClassTemplate({ ...base, weekday: -1 })).toEqual({ error: "INVALID_WEEKDAY" });
  });

  it("odrzuca złą godzinę", () => {
    expect(validateClassTemplate({ ...base, startTime: "25:00" })).toEqual({
      error: "INVALID_TIME",
    });
    expect(validateClassTemplate({ ...base, startTime: "brak" })).toEqual({
      error: "INVALID_TIME",
    });
  });

  it("odrzuca niepoprawny czas trwania", () => {
    expect(validateClassTemplate({ ...base, durationMin: 0 })).toEqual({
      error: "INVALID_DURATION",
    });
    expect(validateClassTemplate({ ...base, durationMin: 12.5 })).toEqual({
      error: "INVALID_DURATION",
    });
  });

  it("odrzuca zerową lub ujemną liczbę miejsc", () => {
    expect(validateClassTemplate({ ...base, capacity: 0 })).toEqual({ error: "INVALID_CAPACITY" });
  });

  it("odrzuca złą datę startu", () => {
    expect(validateClassTemplate({ ...base, startDate: "2026-13-40" })).toEqual({
      error: "INVALID_START_DATE",
    });
  });
});
