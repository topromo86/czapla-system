import { describe, expect, it } from "vitest";
import {
  BONUS_THRESHOLD_SCORE,
  bonusForScore,
  computeAlertRate,
  computeOnboardingRate,
  computeRet90,
  computeTrainerScore,
  findLeaderTrainerIds,
  isBonusEligible,
  MIN_MATURED_COUNT,
  normalizeRet90,
  ratingToNormalized,
  weightedClubSegmentRet90,
} from "./scoring";

const DAY = 86_400_000;

describe("computeRet90", () => {
  it("0 dla pustej kohorty", () => {
    expect(computeRet90([])).toBe(0);
  });

  it("liczy odsetek nie-CHURNED", () => {
    expect(
      computeRet90([{ status: "ACTIVE" }, { status: "ACTIVE" }, { status: "CHURNED" }]),
    ).toBeCloseTo(2 / 3);
  });

  it("FROZEN liczy się jako zatrzymany, nie odszedł", () => {
    expect(computeRet90([{ status: "FROZEN" }, { status: "CHURNED" }])).toBeCloseTo(0.5);
  });

  it("100% gdy nikt nie odszedł", () => {
    expect(computeRet90([{ status: "ACTIVE" }, { status: "ACTIVE" }])).toBe(1);
  });
});

describe("normalizeRet90", () => {
  it("dzieli przez retencję klubu i przycina do [0,1]", () => {
    expect(normalizeRet90(0.5, 0.5)).toBe(1);
    expect(normalizeRet90(0.25, 0.5)).toBe(0.5);
  });

  it("przycina powyżej 1, gdy trener lepszy niż klub", () => {
    expect(normalizeRet90(0.9, 0.3)).toBe(1);
  });

  it("nie dzieli przez zero - zwraca surowe ret90 przycięte do [0,1]", () => {
    expect(normalizeRet90(0.7, 0)).toBe(0.7);
  });
});

describe("weightedClubSegmentRet90", () => {
  it("0 dla pustej kohorty", () => {
    expect(weightedClubSegmentRet90([], { minors: 0.5, adults: 0.7 })).toBe(0);
  });

  it("czysta kohorta dorosłych używa tylko wartości adults", () => {
    const matured = [{ isMinor: false }, { isMinor: false }];
    expect(weightedClubSegmentRet90(matured, { minors: 0.5, adults: 0.7 })).toBeCloseTo(0.7);
  });

  it("mieszana kohorta waży proporcjonalnie do składu", () => {
    const matured = [{ isMinor: true }, { isMinor: false }, { isMinor: false }, { isMinor: false }];
    // 1/4 dzieci (0.5) + 3/4 dorośli (0.7) = 0.125 + 0.525 = 0.65
    expect(weightedClubSegmentRet90(matured, { minors: 0.5, adults: 0.7 })).toBeCloseTo(0.65);
  });
});

describe("ratingToNormalized", () => {
  it("null (brak ocen) traktowane neutralnie jako 0", () => {
    expect(ratingToNormalized(null)).toBe(0);
  });

  it("ocena 3 (środek skali) daje 0", () => {
    expect(ratingToNormalized(3)).toBe(0);
  });

  it("ocena 5 (maksimum) daje 1", () => {
    expect(ratingToNormalized(5)).toBe(1);
  });

  it("ocena 1 (minimum) daje -1", () => {
    expect(ratingToNormalized(1)).toBe(-1);
  });

  it("przycina poza zakres 1-5", () => {
    expect(ratingToNormalized(6)).toBe(1);
  });
});

describe("computeAlertRate", () => {
  it("1 gdy brak zadań w okresie", () => {
    expect(computeAlertRate([])).toBe(1);
  });

  it("liczy zamknięte w terminie", () => {
    const dueAt = new Date("2026-07-10T00:00:00Z");
    const tasks = [
      { closedAt: new Date("2026-07-09T00:00:00Z"), dueAt },
      { closedAt: new Date("2026-07-12T00:00:00Z"), dueAt }, // zamknięte po terminie
      { closedAt: null, dueAt }, // wciąż otwarte
    ];
    expect(computeAlertRate(tasks)).toBeCloseTo(1 / 3);
  });

  it("zamknięcie dokładnie w dueAt liczy się jako w terminie", () => {
    const dueAt = new Date("2026-07-10T00:00:00Z");
    expect(computeAlertRate([{ closedAt: dueAt, dueAt }])).toBe(1);
  });
});

describe("computeOnboardingRate", () => {
  const now = new Date("2026-07-18T00:00:00Z");

  it("1 gdy nic jeszcze nie jest wymagalne", () => {
    const steps = [{ completedAt: null, dueAt: new Date(now.getTime() + DAY) }];
    expect(computeOnboardingRate(steps, now)).toBe(1);
  });

  it("liczy tylko wymagalne etapy", () => {
    const steps = [
      { completedAt: new Date(now.getTime() - DAY), dueAt: new Date(now.getTime() - 2 * DAY) },
      { completedAt: null, dueAt: new Date(now.getTime() - DAY) },
      { completedAt: null, dueAt: new Date(now.getTime() + 10 * DAY) }, // nie wymagalny jeszcze
    ];
    expect(computeOnboardingRate(steps, now)).toBeCloseTo(0.5);
  });
});

describe("computeTrainerScore", () => {
  it(`null gdy maturedCount < ${MIN_MATURED_COUNT}`, () => {
    expect(
      computeTrainerScore({
        maturedCount: 4,
        ret90Norm: 1,
        ratingNorm: 1,
        alertRate: 1,
        onboardingRate: 1,
      }),
    ).toBeNull();
  });

  it(`liczy score dokładnie na granicy maturedCount = ${MIN_MATURED_COUNT}`, () => {
    expect(
      computeTrainerScore({
        maturedCount: MIN_MATURED_COUNT,
        ret90Norm: 1,
        ratingNorm: 1,
        alertRate: 1,
        onboardingRate: 1,
      }),
    ).toBe(100);
  });

  it("same zera dają score 0", () => {
    expect(
      computeTrainerScore({
        maturedCount: 10,
        ret90Norm: 0,
        ratingNorm: 0,
        alertRate: 0,
        onboardingRate: 0,
      }),
    ).toBe(0);
  });

  it("ujemny wkład oceny nie schodzi poniżej zera", () => {
    const score = computeTrainerScore({
      maturedCount: 10,
      ret90Norm: 0,
      ratingNorm: -1,
      alertRate: 0,
      onboardingRate: 0,
    });
    expect(score).toBe(0);
  });

  it("ważona suma zgodna ze wzorem SPEC.md", () => {
    const score = computeTrainerScore({
      maturedCount: 10,
      ret90Norm: 0.8,
      ratingNorm: 0.5,
      alertRate: 0.9,
      onboardingRate: 0.7,
    });
    // 0.45*0.8 + 0.20*0.5 + 0.20*0.9 + 0.15*0.7 = 0.36+0.10+0.18+0.105 = 0.745 -> 75
    expect(score).toBe(75);
  });
});

describe("bonusForScore", () => {
  it("cała kwota po osiągnięciu progu", () => {
    expect(bonusForScore(75, 70, 50000)).toBe(50000);
  });

  it("dokładnie na progu premia się należy", () => {
    expect(bonusForScore(70, 70, 50000)).toBe(50000);
  });

  it("poniżej progu zero, bez proporcji", () => {
    expect(bonusForScore(69, 70, 50000)).toBe(0);
  });

  it("brak wyniku to brak premii", () => {
    expect(bonusForScore(null, 70, 50000)).toBe(0);
  });

  it("zerowa kwota premii daje zero mimo osiągniętego progu", () => {
    expect(bonusForScore(90, 70, 0)).toBe(0);
  });

  it("respektuje próg ustawiony przez właściciela", () => {
    expect(bonusForScore(75, 80, 50000)).toBe(0);
    expect(bonusForScore(75, 60, 50000)).toBe(50000);
  });
});

describe("isBonusEligible", () => {
  it("używa progu przekazanego zamiast domyślnego", () => {
    expect(isBonusEligible(65, 60)).toBe(true);
    expect(isBonusEligible(65, 80)).toBe(false);
  });

  it("false dla null", () => {
    expect(isBonusEligible(null)).toBe(false);
  });

  it("false poniżej progu", () => {
    expect(isBonusEligible(BONUS_THRESHOLD_SCORE - 1)).toBe(false);
  });

  it("true dokładnie na progu", () => {
    expect(isBonusEligible(BONUS_THRESHOLD_SCORE)).toBe(true);
  });
});

describe("findLeaderTrainerIds", () => {
  it("pusta tablica gdy nikt nie ma score", () => {
    expect(
      findLeaderTrainerIds([
        { trainerId: "a", score: null },
        { trainerId: "b", score: null },
      ]),
    ).toEqual([]);
  });

  it("wskazuje jedynego lidera", () => {
    expect(
      findLeaderTrainerIds([
        { trainerId: "a", score: 80 },
        { trainerId: "b", score: 60 },
        { trainerId: "c", score: null },
      ]),
    ).toEqual(["a"]);
  });

  it("przy remisie zwraca wszystkich remisujących", () => {
    expect(
      findLeaderTrainerIds([
        { trainerId: "a", score: 90 },
        { trainerId: "b", score: 90 },
        { trainerId: "c", score: 80 },
      ]),
    ).toEqual(["a", "b"]);
  });
});
