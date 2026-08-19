import { describe, expect, it } from "vitest";
import {
  freeSlots,
  PUBLIC_SCHEDULE_DEFAULT_DAYS,
  PUBLIC_SCHEDULE_MAX_DAYS,
  publicScheduleDays,
  toPublicScheduleSession,
} from "./public-schedule";

describe("publicScheduleDays", () => {
  it("bez parametru daje domyślne dwa tygodnie", () => {
    expect(publicScheduleDays(null)).toBe(PUBLIC_SCHEDULE_DEFAULT_DAYS);
    expect(publicScheduleDays(undefined)).toBe(PUBLIC_SCHEDULE_DEFAULT_DAYS);
  });

  it("śmieci i wartości bezsensowne spadają na domyślne", () => {
    expect(publicScheduleDays("abc")).toBe(PUBLIC_SCHEDULE_DEFAULT_DAYS);
    expect(publicScheduleDays("0")).toBe(PUBLIC_SCHEDULE_DEFAULT_DAYS);
    expect(publicScheduleDays("-7")).toBe(PUBLIC_SCHEDULE_DEFAULT_DAYS);
  });

  it("przycina do górnej granicy", () => {
    expect(publicScheduleDays("3650")).toBe(PUBLIC_SCHEDULE_MAX_DAYS);
  });

  it("obcina część ułamkową", () => {
    expect(publicScheduleDays("7.9")).toBe(7);
  });
});

describe("freeSlots", () => {
  it("liczy wolne miejsca", () => {
    expect(freeSlots(12, 5)).toBe(7);
  });

  it("nadkomplet pokazuje jako brak miejsc, nie liczbę ujemną", () => {
    expect(freeSlots(12, 14)).toBe(0);
  });
});

describe("toPublicScheduleSession", () => {
  const source = {
    id: "ses1",
    name: "Boks - grupa wieczorna",
    startsAt: new Date("2026-09-01T16:00:00.000Z"),
    endsAt: new Date("2026-09-01T17:00:00.000Z"),
    capacity: 12,
    categoryName: "Boks",
    categoryColor: "sky",
    locationName: "Mikołów",
    trainerName: "Daniel Pilc",
    bookedCount: 9,
  };

  it("oddaje wyłącznie pola o zajęciach", () => {
    expect(toPublicScheduleSession(source)).toEqual({
      id: "ses1",
      name: "Boks - grupa wieczorna",
      category: "Boks",
      categoryColor: "sky",
      location: "Mikołów",
      trainer: "Daniel Pilc",
      startsAt: "2026-09-01T16:00:00.000Z",
      endsAt: "2026-09-01T17:00:00.000Z",
      capacity: 12,
      freeSlots: 3,
    });
  });

  it("nie przepuszcza pól spoza listy - klucze są stałe", () => {
    const withExtra = { ...source, memberNames: ["Jan Kowalski"] };
    expect(Object.keys(toPublicScheduleSession(withExtra))).toEqual([
      "id",
      "name",
      "category",
      "categoryColor",
      "location",
      "trainer",
      "startsAt",
      "endsAt",
      "capacity",
      "freeSlots",
    ]);
  });
});
