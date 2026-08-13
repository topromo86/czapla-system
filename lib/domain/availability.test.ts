import { describe, expect, it } from "vitest";
import {
  buildSlots,
  findOverlappingSession,
  findSlot,
  findSlotInOtherRoom,
  isSlotFree,
  formatMinutesAsTime,
  parseTimeToMinutes,
  resolveSessionTime,
  slotStartsWithinWindow,
  validateWindow,
} from "./availability";

// Wtorek 21 lipca 2026, 10:00 czasu polskiego (CEST = UTC+2).
const NOW = new Date("2026-07-21T08:00:00Z");

function window(overrides: Partial<Parameters<typeof buildSlots>[0]["windows"][number]> = {}) {
  return {
    id: "w1",
    trainerId: "t1",
    locationId: "loc1",
    weekday: 2, // wtorek
    startTime: "16:00",
    endTime: "20:00",
    slotMinutes: 60,
    ...overrides,
  };
}

// Godzinny kawałek grafiku. Domyślnie trening indywidualny osoby dorosłej -
// najczęstszy przypadek w tych testach.
function busyAt(
  startsAt: Date,
  who: { trainerId: string; locationId: string },
  extra: Partial<{ kind: "GROUP" | "INDIVIDUAL"; hasMinor: boolean; hasAdult: boolean }> = {},
) {
  return {
    ...who,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    kind: "INDIVIDUAL" as const,
    hasMinor: false,
    hasAdult: true,
    ...extra,
  };
}

describe("parseTimeToMinutes", () => {
  it("parsuje poprawną godzinę", () => {
    expect(parseTimeToMinutes("16:00")).toBe(960);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("akceptuje jednocyfrową godzinę", () => {
    expect(parseTimeToMinutes("9:30")).toBe(570);
  });

  it("odrzuca godzinę spoza doby", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("12:60")).toBeNull();
  });

  it("odrzuca śmieci zamiast zwracać zero", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("wieczorem")).toBeNull();
    expect(parseTimeToMinutes("1600")).toBeNull();
  });
});

describe("formatMinutesAsTime", () => {
  it("formatuje z wiodącym zerem", () => {
    expect(formatMinutesAsTime(960)).toBe("16:00");
    expect(formatMinutesAsTime(570)).toBe("09:30");
    expect(formatMinutesAsTime(0)).toBe("00:00");
  });
});

describe("validateWindow", () => {
  const base = { weekday: 2, startTime: "16:00", endTime: "20:00", slotMinutes: 60 };

  it("przepuszcza poprawne okno", () => {
    expect(validateWindow(base)).toBeNull();
  });

  it("odrzuca dzień tygodnia spoza 0-6", () => {
    expect(validateWindow({ ...base, weekday: 7 })).toBe("INVALID_WEEKDAY");
    expect(validateWindow({ ...base, weekday: -1 })).toBe("INVALID_WEEKDAY");
  });

  it("odrzuca koniec przed początkiem", () => {
    expect(validateWindow({ ...base, startTime: "20:00", endTime: "16:00" })).toBe(
      "END_BEFORE_START",
    );
  });

  it("odrzuca okno zerowej długości", () => {
    expect(validateWindow({ ...base, startTime: "16:00", endTime: "16:00" })).toBe(
      "END_BEFORE_START",
    );
  });

  it("odrzuca okno krótsze niż jeden slot", () => {
    expect(validateWindow({ ...base, startTime: "16:00", endTime: "16:30" })).toBe(
      "WINDOW_SHORTER_THAN_SLOT",
    );
  });

  it("odrzuca niedodatnią długość slotu", () => {
    expect(validateWindow({ ...base, slotMinutes: 0 })).toBe("INVALID_SLOT_MINUTES");
  });
});

describe("slotStartsWithinWindow", () => {
  it("dzieli okno na równe sloty", () => {
    expect(
      slotStartsWithinWindow({ startTime: "16:00", endTime: "20:00", slotMinutes: 60 }),
    ).toEqual([960, 1020, 1080, 1140]);
  });

  it("pomija niepełną końcówkę", () => {
    // 16:00-17:30 przy slotach 60 min = tylko jeden pełny slot.
    expect(
      slotStartsWithinWindow({ startTime: "16:00", endTime: "17:30", slotMinutes: 60 }),
    ).toEqual([960]);
  });

  it("obsługuje sloty 30-minutowe", () => {
    expect(
      slotStartsWithinWindow({ startTime: "16:00", endTime: "17:30", slotMinutes: 30 }),
    ).toEqual([960, 990, 1020]);
  });

  it("zwraca pustą listę dla niepoprawnych godzin", () => {
    expect(
      slotStartsWithinWindow({ startTime: "brak", endTime: "20:00", slotMinutes: 60 }),
    ).toEqual([]);
  });
});

describe("buildSlots", () => {
  it("generuje sloty tylko w dniu tygodnia okna", () => {
    const slots = buildSlots({ windows: [window()], busy: [], now: NOW, horizonDays: 13 });
    for (const slot of slots) {
      expect(slot.startsAt.getUTCDay()).toBe(2);
    }
    // Dwa wtorki w horyzoncie 13 dni, po 4 sloty.
    expect(slots).toHaveLength(8);
  });

  it("wszystkie sloty mieszczą się w godzinach okna", () => {
    const slots = buildSlots({ windows: [window()], busy: [], now: NOW });
    for (const slot of slots) {
      const hourLocal = Number(
        new Intl.DateTimeFormat("pl-PL", {
          timeZone: "Europe/Warsaw",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(slot.startsAt),
      );
      expect(hourLocal).toBeGreaterThanOrEqual(16);
      expect(hourLocal).toBeLessThan(20);
    }
  });

  // Sedno całej funkcji: godzina spoza okna nigdy nie pojawia się na liście,
  // więc nie da się jej zarezerwować (findSlot jej nie znajdzie).
  it("nigdy nie proponuje godziny spoza okna - np. 23:00", () => {
    const slots = buildSlots({ windows: [window()], busy: [], now: NOW });
    const lateSlot = slots.find((slot) => {
      const hour = Number(
        new Intl.DateTimeFormat("pl-PL", {
          timeZone: "Europe/Warsaw",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(slot.startsAt),
      );
      return hour >= 21 || hour < 6;
    });
    expect(lateSlot).toBeUndefined();
  });

  it("oznacza termin zajęty przez tego samego trenera", () => {
    const all = buildSlots({ windows: [window()], busy: [], now: NOW });
    const taken = all[0];
    const marked = buildSlots({
      windows: [window()],
      busy: [busyAt(taken.startsAt, { trainerId: "t1", locationId: "loc1" })],
      now: NOW,
    });
    // Slot zostaje na liście - tylko z powodem blokady, żeby dało się go
    // pokazać jako wyłączony zamiast po cichu usunąć.
    expect(marked).toHaveLength(all.length);
    expect(marked[0].blockedBy).toBe("TRAINER_BUSY");
    expect(marked.filter(isSlotFree)).toHaveLength(all.length - 1);
  });

  // Drugi personalny w tej samej sali JEST dozwolony - to informacja, nie
  // blokada. Klub prowadzi dwa treningi naraz.
  it("drugi trening indywidualny w sali nie blokuje, tylko zgłasza sąsiedztwo", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wAdam", trainerId: "adam", locationId: "mikolow" }),
    ];
    const all = buildSlots({ windows, busy: [], now: NOW });
    const at17 = all[0].startsAt;

    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" })],
      now: NOW,
    });
    const adamSlot = marked.find(
      (s) => s.trainerId === "adam" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(adamSlot?.blockedBy).toBeNull();
    expect(adamSlot?.sharedWith).toBe(1);
  });

  // Zajęcia grupowe to co innego: obok dwudziestu ćwiczących nie ma gdzie
  // stanąć.
  it("zajęcia grupowe blokują salę twardo", () => {
    const windows = [window({ trainerId: "adam", locationId: "mikolow" })];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;

    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "ktosInny", locationId: "mikolow" }, { kind: "GROUP" })],
      now: NOW,
    });
    expect(marked[0].blockedBy).toBe("GROUP_IN_ROOM");
  });

  // Jedyny przypadek, w którym sąsiedztwo jest blokadą: dziecko obok obcego
  // dorosłego. To zasada klubu, nie preferencja klienta.
  it("nie łączy nieletniego z dorosłym", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wAdam", trainerId: "adam", locationId: "mikolow" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const busy = [
      busyAt(
        at17,
        { trainerId: "jacek", locationId: "mikolow" },
        { hasMinor: false, hasAdult: true },
      ),
    ];

    const dlaDziecka = buildSlots({ windows, busy, now: NOW, forMinor: true }).find(
      (s) => s.trainerId === "adam" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(dlaDziecka?.blockedBy).toBe("AGE_MIX");

    const dlaDoroslego = buildSlots({ windows, busy, now: NOW, forMinor: false }).find(
      (s) => s.trainerId === "adam" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(dlaDoroslego?.blockedBy).toBeNull();
  });

  it("dwoje dzieci obok siebie jest w porządku", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wAdam", trainerId: "adam", locationId: "mikolow" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const marked = buildSlots({
      windows,
      busy: [
        busyAt(
          at17,
          { trainerId: "jacek", locationId: "mikolow" },
          { hasMinor: true, hasAdult: false },
        ),
      ],
      now: NOW,
      forMinor: true,
    });
    const adamSlot = marked.find(
      (s) => s.trainerId === "adam" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(adamSlot?.blockedBy).toBeNull();
    expect(adamSlot?.sharedWith).toBe(1);
  });

  // Bez wskazania, kto się zapisuje, reguły wieku nie ma do czego przyłożyć.
  it("bez podanego wieku reguła wieku nie działa", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wAdam", trainerId: "adam", locationId: "mikolow" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const marked = buildSlots({
      windows,
      busy: [
        busyAt(
          at17,
          { trainerId: "jacek", locationId: "mikolow" },
          { hasMinor: true, hasAdult: false },
        ),
      ],
      now: NOW,
    });
    const adamSlot = marked.find(
      (s) => s.trainerId === "adam" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(adamSlot?.blockedBy).toBeNull();
  });

  it("druga sala zostaje wolna", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wJakub", trainerId: "jakub", locationId: "tychy" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;

    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" })],
      now: NOW,
    });
    const tychy = marked.find(
      (s) => s.locationId === "tychy" && s.startsAt.getTime() === at17.getTime(),
    );
    expect(tychy?.blockedBy).toBeNull();
  });

  it("blokada liczy nakładanie się, nie równy start", () => {
    // Trening 60-minutowy od 17:00 zajmuje salę także slotowi 17:30.
    const windows = [
      window({ trainerId: "adam", locationId: "mikolow", slotMinutes: 30, startTime: "17:00" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;

    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" })],
      now: NOW,
    });
    const at1730 = marked.find((s) => s.startsAt.getTime() === at17.getTime() + 30 * 60_000);
    expect(at1730?.sharedWith).toBe(1);
  });

  it("zajęty trener ma pierwszeństwo w powodzie blokady", () => {
    const windows = [window({ trainerId: "jacek", locationId: "mikolow" })];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;

    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" })],
      now: NOW,
    });
    expect(marked[0].blockedBy).toBe("TRAINER_BUSY");
  });

  it("pomija sloty startujące wcześniej niż wynosi wyprzedzenie", () => {
    // Wtorek 13:00 lokalnie, okno 16:00-20:00 tego samego dnia (sloty 16, 17, 18, 19).
    const sameDay = new Date("2026-07-21T11:00:00Z");
    const args = { windows: [window()], busy: [], now: sameDay, horizonDays: 0 };

    // Próg 13:00 + 4h = 17:00 - odpada tylko slot o 16:00.
    expect(buildSlots({ ...args, leadHours: 4 })).toHaveLength(3);

    // Próg 13:00 + 6h = 19:00 - zostaje wyłącznie slot o 19:00.
    expect(buildSlots({ ...args, leadHours: 6 })).toHaveLength(1);
  });

  it("slot dokładnie na progu wyprzedzenia jeszcze się liczy", () => {
    // 13:00 lokalnie + 3h = 16:00, czyli równo pierwszy slot okna.
    const sameDay = new Date("2026-07-21T11:00:00Z");
    const slots = buildSlots({
      windows: [window()],
      busy: [],
      now: sameDay,
      horizonDays: 0,
      leadHours: 3,
    });
    expect(slots).toHaveLength(4);
  });

  it("łączy sloty z wielu okien i sortuje chronologicznie", () => {
    const slots = buildSlots({
      windows: [
        window({ id: "w1", weekday: 2, startTime: "16:00", endTime: "18:00" }),
        window({ id: "w2", weekday: 4, startTime: "10:00", endTime: "12:00" }),
      ],
      busy: [],
      now: NOW,
      horizonDays: 6,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].startsAt.getTime()).toBeGreaterThan(slots[i - 1].startsAt.getTime());
    }
  });

  it("bez okien nie ma żadnych slotów", () => {
    expect(buildSlots({ windows: [], busy: [], now: NOW })).toEqual([]);
  });
});

describe("findSlot", () => {
  const slots = buildSlots({ windows: [window()], busy: [], now: NOW });

  it("znajduje istniejący slot", () => {
    expect(findSlot(slots, "t1", slots[0].startsAt)).not.toBeNull();
  });

  it("odrzuca godzinę spoza listy slotów", () => {
    const offHours = new Date("2026-07-21T21:00:00Z"); // 23:00 lokalnie
    expect(findSlot(slots, "t1", offHours)).toBeNull();
  });

  it("odrzuca slot innego trenera", () => {
    expect(findSlot(slots, "innyTrener", slots[0].startsAt)).toBeNull();
  });

  // Bez tego zapis na salę z grupą przeszedłby przez spreparowany formularz -
  // UI pokazuje taki termin jako wyłączony, ale serwer jest jedyną barierą.
  it("odrzuca slot zablokowany przez zajęcia grupowe", () => {
    const windows = [
      window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
      window({ id: "wAdam", trainerId: "adam", locationId: "mikolow" }),
    ];
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const marked = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" }, { kind: "GROUP" })],
      now: NOW,
    });
    expect(findSlot(marked, "adam", at17)).toBeNull();
  });
});

describe("findSlotInOtherRoom", () => {
  const windows = [
    window({ id: "wJacek", trainerId: "jacek", locationId: "mikolow" }),
    window({ id: "wJakub", trainerId: "jakub", locationId: "tychy" }),
  ];

  it("podpowiada tę samą godzinę w drugiej sali", () => {
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const slots = buildSlots({
      windows,
      busy: [busyAt(at17, { trainerId: "jacek", locationId: "mikolow" }, { kind: "GROUP" })],
      now: NOW,
    });
    const blocked = slots.find(
      (s) => s.locationId === "mikolow" && s.startsAt.getTime() === at17.getTime(),
    )!;

    const alternative = findSlotInOtherRoom(slots, blocked);
    expect(alternative?.locationId).toBe("tychy");
    expect(alternative?.startsAt.getTime()).toBe(at17.getTime());
  });

  it("nie podpowiada nic, gdy druga sala też jest zajęta", () => {
    const at17 = buildSlots({ windows, busy: [], now: NOW })[0].startsAt;
    const slots = buildSlots({
      windows,
      busy: [
        busyAt(at17, { trainerId: "jacek", locationId: "mikolow" }, { kind: "GROUP" }),
        busyAt(at17, { trainerId: "jakub", locationId: "tychy" }, { kind: "GROUP" }),
      ],
      now: NOW,
    });
    const blocked = slots.find(
      (s) => s.locationId === "mikolow" && s.startsAt.getTime() === at17.getTime(),
    )!;

    expect(findSlotInOtherRoom(slots, blocked)).toBeNull();
  });
});

describe("resolveSessionTime", () => {
  it("wylicza start i koniec w czasie letnim", () => {
    const result = resolveSessionTime({
      date: "2026-07-22",
      time: "18:00",
      durationMin: 90,
      now: NOW,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.startsAt.toISOString()).toBe("2026-07-22T16:00:00.000Z");
    expect(result.endsAt.toISOString()).toBe("2026-07-22T17:30:00.000Z");
  });

  it("wylicza poprawnie w czasie zimowym (UTC+1)", () => {
    const result = resolveSessionTime({
      date: "2026-12-15",
      time: "18:00",
      durationMin: 60,
      now: NOW,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.startsAt.toISOString()).toBe("2026-12-15T17:00:00.000Z");
  });

  it("odrzuca datę w przeszłości", () => {
    const result = resolveSessionTime({
      date: "2026-07-01",
      time: "18:00",
      durationMin: 60,
      now: NOW,
    });
    expect(result).toEqual({ error: "IN_THE_PAST" });
  });

  it("pozwala na przeszłość przy jawnej zgodzie (edycja starych zajęć)", () => {
    const result = resolveSessionTime({
      date: "2026-07-01",
      time: "18:00",
      durationMin: 60,
      now: NOW,
      allowPast: true,
    });
    expect("error" in result).toBe(false);
  });

  it("odrzuca nieistniejącą datę", () => {
    expect(
      resolveSessionTime({ date: "2026-02-31", time: "18:00", durationMin: 60, now: NOW }),
    ).toEqual({ error: "INVALID_DATE" });
  });

  it("odrzuca złe formaty i długość", () => {
    expect(
      resolveSessionTime({ date: "22-07-2026", time: "18:00", durationMin: 60, now: NOW }),
    ).toEqual({ error: "INVALID_DATE" });
    expect(
      resolveSessionTime({ date: "2026-07-22", time: "25:00", durationMin: 60, now: NOW }),
    ).toEqual({ error: "INVALID_TIME" });
    expect(
      resolveSessionTime({ date: "2026-07-22", time: "18:00", durationMin: 0, now: NOW }),
    ).toEqual({ error: "INVALID_DURATION" });
  });
});

describe("findOverlappingSession", () => {
  const existing = [
    {
      id: "s1",
      startsAt: new Date("2026-07-22T16:00:00Z"),
      endsAt: new Date("2026-07-22T17:00:00Z"),
    },
  ];

  it("wykrywa nakładanie się terminów", () => {
    const hit = findOverlappingSession(existing, {
      startsAt: new Date("2026-07-22T16:30:00Z"),
      endsAt: new Date("2026-07-22T17:30:00Z"),
    });
    expect(hit?.id).toBe("s1");
  });

  it("styk koniec-w-koniec nie jest kolizją", () => {
    const hit = findOverlappingSession(existing, {
      startsAt: new Date("2026-07-22T17:00:00Z"),
      endsAt: new Date("2026-07-22T18:00:00Z"),
    });
    expect(hit).toBeNull();
  });

  it("sesja edytowana nie koliduje sama ze sobą", () => {
    const hit = findOverlappingSession(
      existing,
      {
        startsAt: new Date("2026-07-22T16:00:00Z"),
        endsAt: new Date("2026-07-22T17:00:00Z"),
      },
      "s1",
    );
    expect(hit).toBeNull();
  });

  it("wykrywa termin całkowicie zawarty w istniejącym", () => {
    const hit = findOverlappingSession(existing, {
      startsAt: new Date("2026-07-22T16:15:00Z"),
      endsAt: new Date("2026-07-22T16:45:00Z"),
    });
    expect(hit?.id).toBe("s1");
  });
});
