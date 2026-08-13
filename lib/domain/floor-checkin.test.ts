import { describe, expect, it } from "vitest";
import {
  elapsedMinutes,
  isVisitValid,
  minutesUntilValid,
  resolveScanOutcome,
} from "./floor-checkin";

const base = new Date("2026-07-30T12:00:00.000Z");
const minsLater = (n: number) => new Date(base.getTime() + n * 60_000);

describe("elapsedMinutes", () => {
  it("liczy pełne minuty", () => {
    expect(elapsedMinutes(base, minsLater(15))).toBe(15);
    expect(elapsedMinutes(base, new Date(base.getTime() + 90_000))).toBe(1);
  });

  it("nie schodzi poniżej zera przy rozjechanym zegarze", () => {
    expect(elapsedMinutes(minsLater(5), base)).toBe(0);
  });
});

describe("resolveScanOutcome", () => {
  it("pierwsze odbicie to zawsze nowe wejście", () => {
    expect(resolveScanOutcome({ lastEnteredAt: null, now: base, minMinutes: 30 })).toBe(
      "NEW_ENTRY",
    );
  });

  it("powtórne odbicie w oknie to wciąż to samo wejście", () => {
    expect(resolveScanOutcome({ lastEnteredAt: base, now: minsLater(10), minMinutes: 30 })).toBe(
      "ALREADY_ON_FLOOR",
    );
  });

  it("odbicie po oknie to nowe wejście", () => {
    expect(resolveScanOutcome({ lastEnteredAt: base, now: minsLater(31), minMinutes: 30 })).toBe(
      "NEW_ENTRY",
    );
  });

  it("przy progu 0 każde odbicie jest nowym wejściem", () => {
    expect(resolveScanOutcome({ lastEnteredAt: base, now: minsLater(1), minMinutes: 0 })).toBe(
      "NEW_ENTRY",
    );
  });
});

describe("isVisitValid", () => {
  it("nieważna przed upływem progu", () => {
    expect(isVisitValid(base, minsLater(10), 30)).toBe(false);
  });

  it("ważna po progu", () => {
    expect(isVisitValid(base, minsLater(30), 30)).toBe(true);
  });

  it("przy progu 0 ważna od razu", () => {
    expect(isVisitValid(base, base, 0)).toBe(true);
  });
});

describe("minutesUntilValid", () => {
  it("zwraca ile zostało", () => {
    expect(minutesUntilValid(base, minsLater(10), 30)).toBe(20);
  });

  it("zero, gdy próg spełniony", () => {
    expect(minutesUntilValid(base, minsLater(40), 30)).toBe(0);
  });
});
