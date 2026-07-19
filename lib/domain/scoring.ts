// Czyste funkcje wyniku trenera - SPEC.md sekcja 2 "Wynik trenera (job
// miesięczny)" jest źródłem prawdy dla wag i progu dojrzałości kohorty.
// Tam, gdzie SPEC jest niejednoznaczny, wybór jest udokumentowany przy danej
// funkcji, nie zgadywany po cichu - to jest system, który ocenia ludzi,
// niejawne założenia tu kosztują najwięcej.

export const MIN_MATURED_COUNT = 5;

export const SCORE_WEIGHTS = {
  ret90: 0.45,
  rating: 0.2,
  alertRate: 0.2,
  onboardingRate: 0.15,
} as const;

// SPEC.md nie podaje liczby - "próg premii" jest w checklist Fazy 5 jako
// osobny punkt, ale bez wartości. Wartość domyślna do świadomej zmiany przez
// właściciela po zobaczeniu pierwszych realnych wyników (patrz PLAN.md).
export const BONUS_THRESHOLD_SCORE = 70;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ret90 = odsetek dojrzałej kohorty (joinedAt <= now-90dni), który nie odszedł.
export function computeRet90(matured: { status: string }[]): number {
  if (matured.length === 0) return 0;
  const retained = matured.filter((m) => m.status !== "CHURNED").length;
  return retained / matured.length;
}

// SPEC.md: "ret90Norm = clamp(ret90 / clubRet90 * clubRet90Target, 0, 1)" -
// `clubRet90Target` nie jest zdefiniowany nigdzie indziej w dokumencie.
// Zamiast zgadywać nieopisaną stałą, normalizujemy względem retencji klubu
// W TYM SAMYM SKŁADZIE GRUPOWYM (dzieci/dorośli) co kohorta trenera - to
// dosłownie realizuje osobny punkt checklisty Fazy 5 "Normalizacja retencji
// względem typu grupy" bez żadnej niezdefiniowanej stałej.
export function normalizeRet90(trainerRet90: number, clubSegmentRet90: number): number {
  if (clubSegmentRet90 <= 0) return clamp(trainerRet90, 0, 1);
  return clamp(trainerRet90 / clubSegmentRet90, 0, 1);
}

// Ważona średnia klubowego ret90 po segmentach (dzieci/dorośli), w proporcji
// zgodnej ze składem kohorty TEGO trenera - trener pracujący głównie z
// dziećmi nie jest porównywany z klubowym poziomem dla dorosłych.
export function weightedClubSegmentRet90(
  matured: { isMinor: boolean }[],
  clubRet90ByGroup: { minors: number; adults: number },
): number {
  if (matured.length === 0) return 0;
  const minorsCount = matured.filter((m) => m.isMinor).length;
  const adultsCount = matured.length - minorsCount;
  return (
    (minorsCount / matured.length) * clubRet90ByGroup.minors +
    (adultsCount / matured.length) * clubRet90ByGroup.adults
  );
}

// (rating-3)/2 ze wzoru SPEC.md, clamp do [-1,1]. Brak jakiejkolwiek oceny w
// okresie (null) traktujemy neutralnie jako środek skali (0), nie jako karę -
// inaczej trener z dopiero startującą grupą byłby ukarany za brak próbki.
export function ratingToNormalized(avgRating: number | null): number {
  if (avgRating == null) return 0;
  return clamp((avgRating - 3) / 2, -1, 1);
}

// alertRate = zadania zamknięte w terminie (closedAt <= dueAt) / wszystkie
// zadania trenera w okresie. Brak zadań w okresie = nic nie zawalone (1).
export function computeAlertRate(tasks: { closedAt: Date | null; dueAt: Date }[]): number {
  if (tasks.length === 0) return 1;
  const onTime = tasks.filter((t) => t.closedAt != null && t.closedAt <= t.dueAt).length;
  return onTime / tasks.length;
}

// onbRate = ukończone OnboardingStep / wszystkie WYMAGALNE (dueAt <= now) w
// okresie. Etapy jeszcze niewymagalne nie liczą się ani na plus, ani na minus.
export function computeOnboardingRate(
  steps: { completedAt: Date | null; dueAt: Date }[],
  now: Date,
): number {
  const due = steps.filter((s) => s.dueAt <= now);
  if (due.length === 0) return 1;
  const completed = due.filter((s) => s.completedAt != null).length;
  return completed / due.length;
}

export type ScoreInputs = {
  maturedCount: number;
  ret90Norm: number;
  ratingNorm: number;
  alertRate: number;
  onboardingRate: number;
};

// SPEC.md: "score = round(0.45*ret90Norm + 0.20*((rating-3)/2) + 0.20*alertRate + 0.15*onbRate) * 100".
// `maturedCount < 5` → null, "koniec" - żaden inny składnik się wtedy nie
// liczy (za mało danych, żeby cokolwiek mówić). Wynik dodatkowo podłogowany
// w 0 (nie w formule SPEC, ale ujemna "ocena na 100" nikomu nic nie mówi -
// przy bardzo złej ocenie/alertRate ważona suma matematycznie może wyjść
// poniżej zera).
export function computeTrainerScore(input: ScoreInputs): number | null {
  if (input.maturedCount < MIN_MATURED_COUNT) return null;
  const weighted =
    SCORE_WEIGHTS.ret90 * input.ret90Norm +
    SCORE_WEIGHTS.rating * input.ratingNorm +
    SCORE_WEIGHTS.alertRate * input.alertRate +
    SCORE_WEIGHTS.onboardingRate * input.onboardingRate;
  return Math.max(0, Math.round(weighted * 100));
}

export function isBonusEligible(score: number | null): boolean {
  return score != null && score >= BONUS_THRESHOLD_SCORE;
}

// Lider = najwyższy wynik wśród trenerów z policzonym score (null pomijamy).
// Przy remisie oznacza wszystkich remisujących - to uczciwsze niż arbitralny
// wybór pierwszego w kolejności.
export function findLeaderTrainerIds(
  scores: { trainerId: string; score: number | null }[],
): string[] {
  const withScore = scores.filter(
    (s): s is { trainerId: string; score: number } => s.score != null,
  );
  if (withScore.length === 0) return [];
  const max = Math.max(...withScore.map((s) => s.score));
  return withScore.filter((s) => s.score === max).map((s) => s.trainerId);
}
