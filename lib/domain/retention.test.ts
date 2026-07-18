import { describe, expect, it } from "vitest";
import {
  classifyInactivityAlert,
  daysSince,
  isValidNoteBody,
  shouldEscalateTask,
} from "./retention";

const DAY = 86_400_000;

describe("daysSince", () => {
  it("null gdy brak daty referencyjnej", () => {
    expect(daysSince(null, new Date())).toBeNull();
  });

  it("liczy pełne dni", () => {
    const now = new Date("2026-07-18T10:00:00Z");
    expect(daysSince(new Date(now.getTime() - 7 * DAY), now)).toBe(7);
  });

  it("zaokrągla w dół dla niepełnego dnia", () => {
    const now = new Date("2026-07-18T10:00:00Z");
    expect(daysSince(new Date(now.getTime() - 7.9 * DAY), now)).toBe(7);
  });
});

describe("classifyInactivityAlert", () => {
  it("null gdy nigdy nie było obecności", () => {
    expect(classifyInactivityAlert(null)).toBeNull();
  });

  it("null poniżej 7 dni", () => {
    expect(classifyInactivityAlert(6)).toBeNull();
  });

  it("INACTIVE_7 dokładnie na granicy", () => {
    expect(classifyInactivityAlert(7)).toBe("INACTIVE_7");
  });

  it("INACTIVE_7 między 7 a 14", () => {
    expect(classifyInactivityAlert(13)).toBe("INACTIVE_7");
  });

  it("INACTIVE_14 dokładnie na granicy", () => {
    expect(classifyInactivityAlert(14)).toBe("INACTIVE_14");
  });

  it("INACTIVE_14 daleko powyżej granicy", () => {
    expect(classifyInactivityAlert(60)).toBe("INACTIVE_14");
  });
});

describe("shouldEscalateTask", () => {
  const now = new Date("2026-07-18T10:00:00Z");

  it("false gdy zadanie zamknięte", () => {
    const task = {
      createdAt: new Date(now.getTime() - 10 * DAY),
      closedAt: now,
      escalatedAt: null,
    };
    expect(shouldEscalateTask(task, now)).toBe(false);
  });

  it("false gdy już eskalowane", () => {
    const task = {
      createdAt: new Date(now.getTime() - 10 * DAY),
      closedAt: null,
      escalatedAt: now,
    };
    expect(shouldEscalateTask(task, now)).toBe(false);
  });

  it("false gdy otwarte krócej niż próg", () => {
    const task = {
      createdAt: new Date(now.getTime() - 6 * DAY),
      closedAt: null,
      escalatedAt: null,
    };
    expect(shouldEscalateTask(task, now)).toBe(false);
  });

  it("true dokładnie na progu 7 dni", () => {
    const task = {
      createdAt: new Date(now.getTime() - 7 * DAY),
      closedAt: null,
      escalatedAt: null,
    };
    expect(shouldEscalateTask(task, now)).toBe(true);
  });

  it("respektuje własny próg", () => {
    const task = {
      createdAt: new Date(now.getTime() - 3 * DAY),
      closedAt: null,
      escalatedAt: null,
    };
    expect(shouldEscalateTask(task, now, 2)).toBe(true);
    expect(shouldEscalateTask(task, now, 5)).toBe(false);
  });
});

describe("isValidNoteBody", () => {
  it("false dla pustego tekstu", () => {
    expect(isValidNoteBody("")).toBe(false);
  });

  it("false poniżej 30 znaków", () => {
    expect(isValidNoteBody("Za krótka notatka.")).toBe(false);
  });

  it("true dokładnie na granicy 30 znaków", () => {
    expect(isValidNoteBody("a".repeat(30))).toBe(true);
  });

  it("ignoruje białe znaki na brzegach przy liczeniu długości", () => {
    const padded = "   " + "a".repeat(30) + "   ";
    expect(isValidNoteBody(padded)).toBe(true);
    expect(isValidNoteBody("   " + "a".repeat(29) + "   ")).toBe(false);
  });

  it("respektuje własny próg", () => {
    expect(isValidNoteBody("krótko", 5)).toBe(true);
    expect(isValidNoteBody("ok", 5)).toBe(false);
  });
});
