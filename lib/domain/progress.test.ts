import { describe, expect, it } from "vitest";
import { computeWeeklyStreak, mondayOfWeek, weeklyAttendanceCounts } from "./progress";
import type { CalendarDate } from "./time";

// Piątek 2026-07-17 - dla ustalenia realnego dnia tygodnia w testach.
const FRIDAY = { year: 2026, month: 7, day: 17 };

function daysAgo(base: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day));
  d.setUTCDate(d.getUTCDate() - days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

describe("mondayOfWeek", () => {
  it("piątek cofa do poniedziałku tego samego tygodnia", () => {
    expect(mondayOfWeek(FRIDAY)).toEqual({ year: 2026, month: 7, day: 13 });
  });

  it("poniedziałek zostaje sobą", () => {
    expect(mondayOfWeek({ year: 2026, month: 7, day: 13 })).toEqual({
      year: 2026,
      month: 7,
      day: 13,
    });
  });

  it("niedziela cofa do poniedziałku tego samego tygodnia (nie następnego)", () => {
    expect(mondayOfWeek({ year: 2026, month: 7, day: 19 })).toEqual({
      year: 2026,
      month: 7,
      day: 13,
    });
  });
});

describe("weeklyAttendanceCounts", () => {
  it("zwraca żądaną liczbę tygodni, licząc od bieżącego wstecz", () => {
    const buckets = weeklyAttendanceCounts([], FRIDAY, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[buckets.length - 1].weekStart).toEqual(mondayOfWeek(FRIDAY));
  });

  it("liczy obecności w tym samym tygodniu razem", () => {
    const buckets = weeklyAttendanceCounts([FRIDAY, daysAgo(FRIDAY, 2)], FRIDAY, 1);
    expect(buckets[0].count).toBe(2);
  });

  it("obecności sprzed okna nie są liczone", () => {
    const buckets = weeklyAttendanceCounts([daysAgo(FRIDAY, 60)], FRIDAY, 4);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});

describe("computeWeeklyStreak", () => {
  it("0 gdy brak jakiejkolwiek obecności", () => {
    expect(computeWeeklyStreak([], FRIDAY)).toBe(0);
  });

  it("liczy bieżący tydzień jako 1, gdy jest w nim obecność", () => {
    expect(computeWeeklyStreak([FRIDAY], FRIDAY)).toBe(1);
  });

  it("bieżący tydzień bez obecności nie zeruje serii z poprzednich tygodni", () => {
    const lastWeek = daysAgo(FRIDAY, 7);
    expect(computeWeeklyStreak([lastWeek], FRIDAY)).toBe(1);
  });

  it("dwa kolejne tygodnie z obecnością dają serię 2", () => {
    const lastWeek = daysAgo(FRIDAY, 7);
    expect(computeWeeklyStreak([FRIDAY, lastWeek], FRIDAY)).toBe(2);
  });

  it("przerwa dwóch tygodni zeruje serię", () => {
    const twoWeeksAgo = daysAgo(FRIDAY, 14);
    expect(computeWeeklyStreak([twoWeeksAgo], FRIDAY)).toBe(0);
  });
});
