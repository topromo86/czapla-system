import { BONUS_THRESHOLD_SCORE, ratingToNormalized } from "@/lib/domain/scoring";
import { colorForRatio } from "@/lib/domain/score-color";

// Pasek 0-100% dla jednej podskładowej wyniku (Retencja/Ocena/Terminowość/
// Onboarding) - kolor liczony tą samą skalą co "Wyjaśnienie statystyk" na
// dole strony (app/admin/ranking/page.tsx), żeby opis i kolor zawsze się
// zgadzały. `ratio` już 0..1 (lub null - brak danych, pasek szary w połowie).
export function MetricBar({
  label,
  ratio,
  valueLabel,
}: {
  label: string;
  ratio: number | null;
  valueLabel: string;
}) {
  const pct = ratio == null ? 50 : Math.min(100, Math.max(0, ratio * 100));
  const color = ratio == null ? "var(--muted-brand)" : colorForRatio(ratio);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted-brand tracking-widest uppercase">{label}</span>
        <span className="text-text">{valueLabel}</span>
      </div>
      <div className="bg-surface-2 h-2 w-full overflow-hidden rounded-full">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// Ocena (1-5) na pasek 0..1 tym samym przeliczeniem, które napędza 20% wagi
// w Wyniku (lib/domain/scoring.ts#ratingToNormalized) - brak oceny w oknie
// traktowane neutralnie (środek skali), nie jako kara.
export function ratingToBarRatio(rating: number | null): number {
  return (ratingToNormalized(rating) + 1) / 2;
}

// Duży pasek "postęp do premii" pod każdym trenerem. Skala 0-100 (naturalny
// zakres Wyniku), z kreskowanym znacznikiem progu premii - wypełnienie może
// iść DALEJ niż znacznik, żeby trener widział, że powyżej progu wciąż jest
// miejsce na wzrost (do 100), a nie że premia to "sufit".
export function ScoreProgressBar({
  score,
  threshold = BONUS_THRESHOLD_SCORE,
}: {
  score: number;
  threshold?: number;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const reached = clamped >= threshold;
  const color = reached ? "#1f8a5c" : colorForRatio(clamped / threshold);

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between font-mono text-xs tracking-widest uppercase">
        <span className="text-muted-brand">Postęp do premii</span>
        <span className={reached ? "text-jade" : "text-muted-brand"}>
          {reached
            ? `+${clamped - threshold} pkt nad progiem`
            : `brakuje ${threshold - clamped} pkt`}
        </span>
      </div>

      <div className="relative">
        <div className="bg-surface-2 h-3 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
          {reached && clamped > threshold ? (
            <div
              className="absolute top-0 h-full opacity-30"
              style={{
                left: `${threshold}%`,
                width: `${clamped - threshold}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0, #fff 3px, transparent 3px, transparent 7px)",
              }}
            />
          ) : null}
        </div>
        <div
          className="border-text/40 pointer-events-none absolute inset-y-0 border-l-2 border-dashed"
          style={{ left: `${threshold}%` }}
        />
      </div>

      <div className="relative mt-1 h-4">
        <span className="text-muted-brand absolute left-0 font-mono text-[10px]">0</span>
        <span
          className="text-muted-brand absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
          style={{ left: `${threshold}%` }}
        >
          ▲ {threshold} (próg premii)
        </span>
        <span className="text-muted-brand absolute right-0 font-mono text-[10px]">100</span>
      </div>
    </div>
  );
}
