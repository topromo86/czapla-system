// Kolory i opisy ocen zajęć (1-5). Jedno źródło dla ekranu klienta i dla
// panelu opinii właściciela - inaczej "czwórka" byłaby zielona w jednym
// miejscu i żółta w drugim.
//
// Kolory bierzemy z tej samej rampy co paski w Rankingu
// (lib/domain/score-color.ts): czerwień → pomarańcz → żółć → limonka →
// jadeit. Dzięki temu "słabo" i "dobrze" wyglądają w całej apce tak samo.

import { colorForRatio } from "./score-color";

export const RATING_SCORES = [1, 2, 3, 4, 5] as const;

export type RatingScore = (typeof RATING_SCORES)[number];

export const RATING_LABEL: Record<number, string> = {
  1: "słabo",
  2: "średnio",
  3: "w porządku",
  4: "dobrze",
  5: "świetnie",
};

export function isRatingScore(value: number): value is RatingScore {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// 1 → 0.0 (czerwień), 5 → 1.0 (jadeit).
export function scoreColor(score: number): string {
  const clamped = Math.min(5, Math.max(1, score));
  return colorForRatio((clamped - 1) / 4);
}

// Średnia ocena na tę samą rampę - do podsumowania w panelu właściciela.
export function averageScoreColor(average: number | null): string {
  return average == null ? "var(--muted-brand)" : scoreColor(average);
}
