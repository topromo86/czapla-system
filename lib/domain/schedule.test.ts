import { describe, expect, it } from "vitest";
import {
  bookingHorizonEnd,
  describeHorizon,
  gridCellKey,
  hourRange,
  hoursInRange,
  mondayIndex,
  sessionBookableStatus,
  startOfWeek,
  weekDays,
} from "./schedule";

// Pomocnik: co pokazuje zegar w Warszawie dla danego moment UTC.
function warsaw(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

describe("mondayIndex", () => {
  it("poniedziałek jest zerem, niedziela szóstką", () => {
    expect(mondayIndex(1)).toBe(0); // poniedziałek
    expect(mondayIndex(4)).toBe(3); // czwartek
    expect(mondayIndex(0)).toBe(6); // niedziela
  });
});

describe("startOfWeek", () => {
  it("z czwartku cofa do poniedziałku", () => {
    // 2026-07-23 to czwartek.
    expect(startOfWeek({ year: 2026, month: 7, day: 23 })).toEqual({
      year: 2026,
      month: 7,
      day: 20,
    });
  });

  it("poniedziałek zostaje sobą", () => {
    expect(startOfWeek({ year: 2026, month: 7, day: 20 })).toEqual({
      year: 2026,
      month: 7,
      day: 20,
    });
  });

  it("niedziela należy do tygodnia, który zaczął się w poniedziałek", () => {
    // 2026-07-26 to niedziela - jej tydzień zaczyna się 20 lipca.
    expect(startOfWeek({ year: 2026, month: 7, day: 26 })).toEqual({
      year: 2026,
      month: 7,
      day: 20,
    });
  });

  it("przechodzi przez granicę miesiąca", () => {
    // 2026-08-02 to niedziela.
    expect(startOfWeek({ year: 2026, month: 8, day: 2 })).toEqual({
      year: 2026,
      month: 7,
      day: 27,
    });
  });
});

describe("weekDays", () => {
  it("daje siedem kolejnych dni od poniedziałku", () => {
    const days = weekDays({ year: 2026, month: 7, day: 20 });
    expect(days).toHaveLength(7);
    expect(days[0].day).toBe(20);
    expect(days[6].day).toBe(26);
  });
});

describe("bookingHorizonEnd - CURRENT_WEEK", () => {
  const mode = "CURRENT_WEEK" as const;

  it("w poniedziałek sięga do końca tej samej niedzieli", () => {
    // Poniedziałek 20 lipca 2026, 10:00 czasu polskiego.
    const now = new Date("2026-07-20T08:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now }))).toBe("2026-07-27 00:00");
  });

  it("w czwartek sięga do tej samej niedzieli, nie dalej", () => {
    const now = new Date("2026-07-23T08:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now }))).toBe("2026-07-27 00:00");
  });

  it("w niedzielę wieczorem nadal obejmuje tę niedzielę", () => {
    // Niedziela 26 lipca, 22:00 czasu polskiego.
    const now = new Date("2026-07-26T20:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now }))).toBe("2026-07-27 00:00");
  });

  // Sedno resetu: minutę po północy w poniedziałek okno skacze o tydzień.
  it("resetuje się o północy z niedzieli na poniedziałek", () => {
    const sundayLate = new Date("2026-07-26T21:59:00Z"); // 23:59 w PL
    const mondayEarly = new Date("2026-07-26T22:01:00Z"); // 00:01 w PL, już poniedziałek

    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now: sundayLate }))).toBe("2026-07-27 00:00");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now: mondayEarly }))).toBe("2026-08-03 00:00");
  });

  it("ignoruje ustawioną liczbę dni", () => {
    const now = new Date("2026-07-23T08:00:00Z");
    const a = bookingHorizonEnd({ mode, days: 7, now });
    const b = bookingHorizonEnd({ mode, days: 28, now });
    expect(a.getTime()).toBe(b.getTime());
  });

  it("działa też w czasie zimowym (UTC+1)", () => {
    // Czwartek 10 grudnia 2026.
    const now = new Date("2026-12-10T09:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now }))).toBe("2026-12-14 00:00");
  });
});

describe("bookingHorizonEnd - FIXED_DAYS", () => {
  const mode = "FIXED_DAYS" as const;

  it("7 dni od czwartku sięga do końca kolejnego czwartku", () => {
    const now = new Date("2026-07-23T08:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 7, now }))).toBe("2026-07-31 00:00");
  });

  it("28 dni liczy się poprawnie przez granicę miesiąca", () => {
    const now = new Date("2026-07-23T08:00:00Z");
    expect(warsaw(bookingHorizonEnd({ mode, days: 28, now }))).toBe("2026-08-21 00:00");
  });

  it("nie zależy od dnia tygodnia", () => {
    const monday = bookingHorizonEnd({ mode, days: 14, now: new Date("2026-07-20T08:00:00Z") });
    const thursday = bookingHorizonEnd({ mode, days: 14, now: new Date("2026-07-23T08:00:00Z") });
    expect(warsaw(monday)).toBe("2026-08-04 00:00");
    expect(warsaw(thursday)).toBe("2026-08-07 00:00");
  });
});

describe("sessionBookableStatus", () => {
  const now = new Date("2026-07-20T08:00:00Z");
  const horizonEnd = new Date("2026-07-26T22:00:00Z");
  const base = {
    now,
    horizonEnd,
    bookedCount: 0,
    memberAlreadyBooked: false,
    session: { startsAt: new Date("2026-07-21T16:00:00Z"), status: "SCHEDULED", capacity: 12 },
  };

  it("wolny termin w oknie jest do zapisania", () => {
    expect(sessionBookableStatus(base)).toBe("BOOKABLE");
  });

  it("odwołane wygrywa nad wszystkim", () => {
    expect(
      sessionBookableStatus({
        ...base,
        session: { ...base.session, status: "CANCELLED" },
        bookedCount: 99,
      }),
    ).toBe("CANCELLED");
  });

  it("własny zapis widać przed informacją o pełnym komplecie", () => {
    expect(
      sessionBookableStatus({ ...base, memberAlreadyBooked: true, bookedCount: 12 }),
    ).toBe("ALREADY_BOOKED");
  });

  it("termin z przeszłości", () => {
    expect(
      sessionBookableStatus({
        ...base,
        session: { ...base.session, startsAt: new Date("2026-07-19T16:00:00Z") },
      }),
    ).toBe("PAST");
  });

  it("termin poza oknem zapisów", () => {
    expect(
      sessionBookableStatus({
        ...base,
        session: { ...base.session, startsAt: new Date("2026-07-28T16:00:00Z") },
      }),
    ).toBe("BEYOND_HORIZON");
  });

  it("komplet uczestników", () => {
    expect(sessionBookableStatus({ ...base, bookedCount: 12 })).toBe("FULL");
  });

  it("termin dokładnie na granicy okna już nie łapie się do zapisu", () => {
    expect(
      sessionBookableStatus({ ...base, session: { ...base.session, startsAt: horizonEnd } }),
    ).toBe("BEYOND_HORIZON");
  });
});

describe("hourRange", () => {
  it("bez zajęć daje domyślny zakres", () => {
    expect(hourRange([])).toEqual({ from: 8, to: 21 });
  });

  it("obejmuje najwcześniejsze i najpóźniejsze zajęcia z zapasem na koniec", () => {
    expect(hourRange([17, 18, 20])).toEqual({ from: 17, to: 21 });
  });

  it("nie wychodzi poza dobę", () => {
    expect(hourRange([23])).toEqual({ from: 23, to: 23 });
  });
});

describe("hoursInRange", () => {
  it("wypisuje kolejne godziny włącznie z krańcami", () => {
    expect(hoursInRange({ from: 17, to: 20 })).toEqual([17, 18, 19, 20]);
  });
});

describe("gridCellKey", () => {
  it("skleja dzień i godzinę w stabilny klucz", () => {
    expect(gridCellKey({ year: 2026, month: 7, day: 5 }, 9)).toBe("2026-07-05T09");
  });
});

describe("describeHorizon", () => {
  it("opisuje tryb tygodniowy", () => {
    expect(describeHorizon("CURRENT_WEEK", 7)).toContain("niedzieli");
  });

  it("opisuje tryb stałej liczby dni", () => {
    expect(describeHorizon("FIXED_DAYS", 21)).toBe("21 dni do przodu");
  });
});
