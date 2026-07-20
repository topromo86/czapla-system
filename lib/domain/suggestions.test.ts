import { describe, expect, it } from "vitest";
import {
  buildPatterns,
  HISTORY_WEEKS,
  MAX_WEEKS_SINCE_LAST,
  suggestSessions,
  type AttendedSession,
  type CandidateSession,
} from "./suggestions";

const NOW = new Date("2026-07-20T08:00:00Z"); // poniedziałek
const WEEK = 7 * 86_400_000;

// Obecność N tygodni temu na slocie "poniedziałek 18:00, boks, Tychy".
function visit(weeksAgo: number, over: Partial<AttendedSession> = {}): AttendedSession {
  return {
    startsAt: new Date(NOW.getTime() - weeksAgo * WEEK),
    weekday: 1,
    hour: 18,
    categoryKey: "boks",
    locationId: "tychy",
    ...over,
  };
}

function candidate(id: string, daysAhead: number, over: Partial<CandidateSession> = {}) {
  return {
    id,
    startsAt: new Date(NOW.getTime() + daysAhead * 86_400_000),
    weekday: 1,
    hour: 18,
    categoryKey: "boks",
    locationId: "tychy",
    freeSpots: 5,
    ...over,
  };
}

describe("buildPatterns", () => {
  it("zlicza wizyty na tym samym slocie", () => {
    const patterns = buildPatterns([visit(1), visit(2), visit(3)], NOW);
    expect(patterns.get("1|18|boks|tychy")?.visits).toBe(3);
  });

  it("rozdziela różne sloty", () => {
    const patterns = buildPatterns([visit(1), visit(1, { hour: 20 })], NOW);
    expect(patterns.size).toBe(2);
  });

  it("pomija historię starszą niż okno analizy", () => {
    const patterns = buildPatterns([visit(HISTORY_WEEKS + 2)], NOW);
    expect(patterns.size).toBe(0);
  });

  it("pomija zajęcia z przyszłości", () => {
    const patterns = buildPatterns([visit(-2)], NOW);
    expect(patterns.size).toBe(0);
  });
});

describe("suggestSessions", () => {
  const base = { bookedSessionIds: [], now: NOW };

  it("sugeruje powtarzalny slot", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2), visit(3)],
      candidates: [candidate("s1", 7)],
    });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("s1");
    expect(result[0].visits).toBe(3);
  });

  // Sedno: jednorazowa wizyta to nie nawyk.
  it("NIE sugeruje po jednej wizycie", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1)],
      candidates: [candidate("s1", 7)],
    });
    expect(result).toEqual([]);
  });

  it("NIE sugeruje nawyku porzuconego dawno temu", () => {
    const old = MAX_WEEKS_SINCE_LAST + 1;
    const result = suggestSessions({
      ...base,
      history: [visit(old), visit(old + 1), visit(old + 2)],
      candidates: [candidate("s1", 7)],
    });
    expect(result).toEqual([]);
  });

  it("NIE sugeruje zajęć, na które klient już jest zapisany", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2)],
      candidates: [candidate("s1", 7)],
      bookedSessionIds: ["s1"],
    });
    expect(result).toEqual([]);
  });

  // Sugestia, której nie da się przyjąć, tylko irytuje.
  it("NIE sugeruje zajęć bez wolnych miejsc", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2)],
      candidates: [candidate("s1", 7, { freeSpots: 0 })],
    });
    expect(result).toEqual([]);
  });

  it("NIE sugeruje terminu, który już minął", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2)],
      candidates: [candidate("s1", -1)],
    });
    expect(result).toEqual([]);
  });

  it("nie miesza lokalizacji ani rodzajów zajęć", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2)],
      candidates: [
        candidate("innaLokalizacja", 7, { locationId: "mikolow" }),
        candidate("innyRodzaj", 7, { categoryKey: "junior" }),
      ],
    });
    expect(result).toEqual([]);
  });

  it("mocniejszy nawyk idzie pierwszy", () => {
    const result = suggestSessions({
      ...base,
      history: [
        visit(1),
        visit(2),
        visit(3), // poniedziałek 18:00 - 3 wizyty
        visit(1, { hour: 20 }),
        visit(2, { hour: 20 }), // poniedziałek 20:00 - 2 wizyty
      ],
      candidates: [candidate("slabszy", 7, { hour: 20 }), candidate("mocniejszy", 7)],
    });
    expect(result.map((r) => r.sessionId)).toEqual(["mocniejszy", "slabszy"]);
  });

  // Bez deduplikacji klient dostałby ten sam poniedziałek 18:00 z czterech
  // kolejnych tygodni naraz.
  it("z jednego slotu proponuje tylko najbliższy termin", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2)],
      candidates: [candidate("zaTydzien", 7), candidate("zaDwaTygodnie", 14)],
    });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("zaTydzien");
  });

  it("respektuje limit", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(1), visit(2), visit(1, { hour: 20 }), visit(2, { hour: 20 })],
      candidates: [candidate("a", 7), candidate("b", 7, { hour: 20 })],
      limit: 1,
    });
    expect(result).toHaveLength(1);
  });

  it("uzasadnienie mówi o liczbie wizyt", () => {
    const result = suggestSessions({
      ...base,
      history: [visit(3), visit(4), visit(5)],
      candidates: [candidate("s1", 7)],
    });
    expect(result[0].reason).toContain("3 razy");
  });
});
