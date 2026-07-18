import { describe, expect, it } from "vitest";
import { addCalendarDays, calendarWeekday, todayInTimeZone, zonedTimeToUtc } from "./time";

describe("zonedTimeToUtc", () => {
  it("zimą (CET, UTC+1): 18:00 czasu polskiego to 17:00 UTC", () => {
    const d = zonedTimeToUtc(2026, 1, 15, 18, 0);
    expect(d.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("latem (CEST, UTC+2): 18:00 czasu polskiego to 16:00 UTC", () => {
    const d = zonedTimeToUtc(2026, 7, 15, 18, 0);
    expect(d.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("poprawnie po wiosennej zmianie czasu (ostatnia niedziela marca)", () => {
    // 2026: zmiana na czas letni 29 marca. 30 marca to już CEST (UTC+2).
    const d = zonedTimeToUtc(2026, 3, 30, 18, 0);
    expect(d.toISOString()).toBe("2026-03-30T16:00:00.000Z");
  });

  it("poprawnie przed jesienną zmianą czasu (ostatnia niedziela października)", () => {
    // 2026: zmiana na czas zimowy 25 pazdziernika. 24 pazdziernika to jeszcze CEST.
    const before = zonedTimeToUtc(2026, 10, 24, 18, 0);
    expect(before.toISOString()).toBe("2026-10-24T16:00:00.000Z");
    const after = zonedTimeToUtc(2026, 10, 26, 18, 0);
    expect(after.toISOString()).toBe("2026-10-26T17:00:00.000Z");
  });
});

describe("todayInTimeZone", () => {
  it("zwraca datę kalendarzową Warszawy, nie UTC serwera", () => {
    // 23:30 UTC 15 stycznia = 00:30 CET 16 stycznia w Warszawie.
    const now = new Date("2026-01-15T23:30:00.000Z");
    expect(todayInTimeZone(now)).toEqual({ year: 2026, month: 1, day: 16 });
  });

  it("dla południa UTC data jest taka sama jak w Warszawie", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    expect(todayInTimeZone(now)).toEqual({ year: 2026, month: 6, day: 15 });
  });
});

describe("addCalendarDays", () => {
  it("dodaje dni w obrębie miesiąca", () => {
    expect(addCalendarDays({ year: 2026, month: 6, day: 10 }, 5)).toEqual({
      year: 2026,
      month: 6,
      day: 15,
    });
  });

  it("przechodzi poprawnie przez koniec miesiąca i roku", () => {
    expect(addCalendarDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({
      year: 2027,
      month: 1,
      day: 2,
    });
  });
});

describe("calendarWeekday", () => {
  it("2026-01-01 to czwartek (4)", () => {
    expect(calendarWeekday({ year: 2026, month: 1, day: 1 })).toBe(4);
  });

  it("niedziela to 0", () => {
    expect(calendarWeekday({ year: 2026, month: 1, day: 4 })).toBe(0);
  });
});
