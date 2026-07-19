import { describe, expect, it } from "vitest";
import {
  isAbsenceReason,
  MAX_ABSENCE_DAYS,
  resolveAbsenceOutcome,
  resolveAbsenceRangeEnd,
  summarizeAbsenceImpact,
} from "./absence";
import { zonedTimeToUtc } from "./time";

const NOW = new Date("2026-07-20T08:00:00Z"); // poniedziałek, 10:00 czasu polskiego

function booking(id: string, startsAt: string, sessionName = "Boks") {
  return { id, sessionName, startsAt: new Date(startsAt) };
}

describe("isAbsenceReason", () => {
  it("przyjmuje znane powody", () => {
    expect(isAbsenceReason("INJURY")).toBe(true);
    expect(isAbsenceReason("OTHER")).toBe(true);
  });

  it("odrzuca cokolwiek innego", () => {
    expect(isAbsenceReason("URLOP")).toBe(false);
    expect(isAbsenceReason("")).toBe(false);
  });
});

describe("summarizeAbsenceImpact", () => {
  it("dzieli zajęcia na bezkosztowe i kosztujące wejście", () => {
    const impact = summarizeAbsenceImpact(
      [
        booking("b1", "2026-07-20T09:00:00Z"), // za godzinę - mniej niż 4h
        booking("b2", "2026-07-20T16:00:00Z"), // za 8h - na czas
        booking("b3", "2026-07-22T16:00:00Z"), // pojutrze
      ],
      NOW,
    );

    expect(impact.costlyCount).toBe(1);
    expect(impact.freeCount).toBe(2);
    expect(impact.entries.find((e) => e.booking.id === "b1")?.free).toBe(false);
    expect(impact.entries.find((e) => e.booking.id === "b2")?.free).toBe(true);
  });

  it("granica dokładnie 4h liczy się jako odwołanie na czas", () => {
    const impact = summarizeAbsenceImpact([booking("b1", "2026-07-20T12:00:00Z")], NOW);
    expect(impact.freeCount).toBe(1);
    expect(impact.costlyCount).toBe(0);
  });

  it("sortuje chronologicznie niezależnie od kolejności wejściowej", () => {
    const impact = summarizeAbsenceImpact(
      [
        booking("b3", "2026-07-24T16:00:00Z"),
        booking("b1", "2026-07-21T16:00:00Z"),
        booking("b2", "2026-07-22T16:00:00Z"),
      ],
      NOW,
    );
    expect(impact.entries.map((e) => e.booking.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("pusta lista to zerowy wpływ", () => {
    const impact = summarizeAbsenceImpact([], NOW);
    expect(impact).toEqual({ entries: [], freeCount: 0, costlyCount: 0 });
  });
});

describe("resolveAbsenceOutcome", () => {
  // Sedno wariantu C: zgłoszenie nieobecności nie omija reguły 4 godzin.
  it("spóźnione zgłoszenie to NO_SHOW - wejście przepada", () => {
    expect(resolveAbsenceOutcome(new Date("2026-07-20T09:00:00Z"), NOW)).toBe("NO_SHOW");
  });

  it("zgłoszenie z wyprzedzeniem jest bezkosztowe", () => {
    expect(resolveAbsenceOutcome(new Date("2026-07-20T16:00:00Z"), NOW)).toBe("CANCELLED");
  });
});

describe("resolveAbsenceRangeEnd", () => {
  const base = { now: NOW, toUtc: zonedTimeToUtc };

  it("obejmuje cały ostatni dzień przerwy", () => {
    const result = resolveAbsenceRangeEnd({ ...base, until: "2026-07-25" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // Północ z 25 na 26 lipca czasu polskiego = 22:00 UTC 25 lipca (CEST).
    expect(result.endsAt.toISOString()).toBe("2026-07-25T22:00:00.000Z");
  });

  it("działa poprawnie w czasie zimowym", () => {
    const result = resolveAbsenceRangeEnd({
      ...base,
      now: new Date("2026-12-01T08:00:00Z"),
      until: "2026-12-10",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.endsAt.toISOString()).toBe("2026-12-10T23:00:00.000Z");
  });

  it("odrzuca datę z przeszłości", () => {
    expect(resolveAbsenceRangeEnd({ ...base, until: "2026-07-01" })).toEqual({
      error: "DATE_IN_THE_PAST",
    });
  });

  it("dzisiejsza data jest dozwolona - przerwa tylko na dziś", () => {
    const result = resolveAbsenceRangeEnd({ ...base, until: "2026-07-20" });
    expect("error" in result).toBe(false);
  });

  it("odrzuca zły format", () => {
    expect(resolveAbsenceRangeEnd({ ...base, until: "20.07.2026" })).toEqual({
      error: "INVALID_DATE",
    });
    expect(resolveAbsenceRangeEnd({ ...base, until: "" })).toEqual({ error: "INVALID_DATE" });
  });

  it("odrzuca nieistniejący miesiąc", () => {
    expect(resolveAbsenceRangeEnd({ ...base, until: "2026-13-01" })).toEqual({
      error: "INVALID_DATE",
    });
  });

  it("odrzuca przerwę dłuższą niż limit", () => {
    const result = resolveAbsenceRangeEnd({ ...base, until: "2027-06-01" });
    expect(result).toEqual({ error: "RANGE_TOO_LONG" });
  });

  it("przerwa równa limitowi jeszcze przechodzi", () => {
    const until = new Date(NOW.getTime() + (MAX_ABSENCE_DAYS - 2) * 86_400_000);
    const iso = until.toISOString().slice(0, 10);
    expect("error" in resolveAbsenceRangeEnd({ ...base, until: iso })).toBe(false);
  });
});
