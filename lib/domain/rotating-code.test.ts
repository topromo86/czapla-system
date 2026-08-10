import { describe, expect, it } from "vitest";
import {
  buildCode,
  CODE_PERIOD_SECONDS,
  codePayload,
  isPeriodAcceptable,
  parseCode,
  periodNumber,
  secondsLeftInPeriod,
} from "./rotating-code";

// Równa wielokrotność 30 s, żeby liczby okien wychodziły okrągłe.
const NOW = new Date("2026-08-10T17:00:00Z");

describe("periodNumber", () => {
  it("dzieli czas na okna po 30 s", () => {
    const base = periodNumber(NOW);
    expect(periodNumber(new Date(NOW.getTime() + 29_000))).toBe(base);
    expect(periodNumber(new Date(NOW.getTime() + 30_000))).toBe(base + 1);
  });
});

describe("parseCode", () => {
  it("czyta poprawny kod", () => {
    const code = buildCode("user123", 55_555, "abcdef12");
    expect(parseCode(code)).toEqual({ userId: "user123", period: 55_555, signature: "abcdef12" });
  });

  it("odrzuca kod z obcym prefiksem", () => {
    expect(parseCode("inny.user123.55555.abcdef12")).toBeNull();
  });

  it("odrzuca kod bez podpisu", () => {
    expect(parseCode("tfc1.user123.55555")).toBeNull();
  });

  it("odrzuca kod z nieliczbowym oknem", () => {
    expect(parseCode("tfc1.user123.abc.abcdef12")).toBeNull();
  });

  // Zwykły token wejścia z /kod ma inny kształt - ma odpaść tutaj, a nie
  // udawać kod rotacyjny.
  it("odrzuca cokolwiek innego", () => {
    expect(parseCode("Zm9vYmFyYmF6")).toBeNull();
    expect(parseCode("")).toBeNull();
  });
});

describe("codePayload", () => {
  it("jest identyczny dla tych samych danych", () => {
    expect(codePayload("u1", 10)).toBe(codePayload("u1", 10));
  });

  it("różni się dla innego okna", () => {
    expect(codePayload("u1", 10)).not.toBe(codePayload("u1", 11));
  });

  it("różni się dla innego konta", () => {
    expect(codePayload("u1", 10)).not.toBe(codePayload("u2", 10));
  });
});

describe("isPeriodAcceptable", () => {
  const period = periodNumber(NOW);

  it("przyjmuje bieżące okno", () => {
    expect(isPeriodAcceptable(period, NOW)).toBe(true);
  });

  // Rozjazd zegarów telefonu i serwera - jedno okno w każdą stronę.
  it("przyjmuje sąsiednie okna", () => {
    expect(isPeriodAcceptable(period - 1, NOW)).toBe(true);
    expect(isPeriodAcceptable(period + 1, NOW)).toBe(true);
  });

  it("odrzuca kod sprzed minuty", () => {
    expect(isPeriodAcceptable(period - 2, NOW)).toBe(false);
  });

  it("odrzuca kod z przyszłości", () => {
    expect(isPeriodAcceptable(period + 2, NOW)).toBe(false);
  });

  it("zrzut ekranu sprzed godziny nie przechodzi", () => {
    const stary = periodNumber(new Date(NOW.getTime() - 3_600_000));
    expect(isPeriodAcceptable(stary, NOW)).toBe(false);
  });
});

describe("secondsLeftInPeriod", () => {
  it("na starcie okna zostaje pełne okno", () => {
    expect(secondsLeftInPeriod(NOW)).toBe(CODE_PERIOD_SECONDS);
  });

  it("odlicza w dół", () => {
    expect(secondsLeftInPeriod(new Date(NOW.getTime() + 10_000))).toBe(20);
    expect(secondsLeftInPeriod(new Date(NOW.getTime() + 29_000))).toBe(1);
  });
});
