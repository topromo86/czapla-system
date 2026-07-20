import { describe, expect, it } from "vitest";
import { averageScoreColor, isRatingScore, RATING_LABEL, scoreColor } from "./rating";
import { colorForRatio } from "./score-color";

describe("isRatingScore", () => {
  it("przyjmuje oceny 1-5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isRatingScore(n)).toBe(true);
  });

  it("odrzuca wartości spoza skali", () => {
    expect(isRatingScore(0)).toBe(false);
    expect(isRatingScore(6)).toBe(false);
    expect(isRatingScore(-1)).toBe(false);
  });

  it("odrzuca ułamki", () => {
    expect(isRatingScore(3.5)).toBe(false);
  });
});

describe("scoreColor", () => {
  it("jedynka jest czerwona, piątka zielona", () => {
    expect(scoreColor(1)).toBe(colorForRatio(0));
    expect(scoreColor(5)).toBe(colorForRatio(1));
  });

  it("trójka trafia w środek rampy", () => {
    expect(scoreColor(3)).toBe(colorForRatio(0.5));
  });

  it("kolejne oceny idą od czerwieni ku zieleni bez powtórzeń", () => {
    const colors = [1, 2, 3, 4, 5].map(scoreColor);
    expect(new Set(colors).size).toBe(5);
  });

  it("przycina wartości spoza skali zamiast wychodzić poza rampę", () => {
    expect(scoreColor(0)).toBe(scoreColor(1));
    expect(scoreColor(9)).toBe(scoreColor(5));
  });
});

describe("averageScoreColor", () => {
  it("brak ocen daje kolor neutralny", () => {
    expect(averageScoreColor(null)).toBe("var(--muted-brand)");
  });

  it("średnia ułamkowa wypada między ocenami sąsiednimi", () => {
    const between = averageScoreColor(3.5);
    expect(between).not.toBe(scoreColor(3));
    expect(between).not.toBe(scoreColor(4));
  });
});

describe("RATING_LABEL", () => {
  it("opisuje każdą ocenę ze skali", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(RATING_LABEL[n]).toBeTruthy();
  });
});
