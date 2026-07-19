import { Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { BONUS_THRESHOLD_SCORE, findLeaderTrainerIds, MIN_MATURED_COUNT } from "@/lib/domain/scoring";
import { colorForRatio } from "@/lib/domain/score-color";
import { formatDate } from "@/lib/format";
import { MetricBar, ratingToBarRatio, ScoreProgressBar } from "./metric-bar";

function formatPercent(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

// Ranking trenerów (SPEC.md sekcja 3, ekran właściciela): karty punktowe,
// próg premii, oznaczenie "za mało danych". W odróżnieniu od /trainer/karta -
// tu widać wszystkich, bo to ekran właściciela, nie trenera.
export default async function AdminRankingPage() {
  await requireRole("ADMIN");

  const latestScore = await prisma.trainerScore.findFirst({ orderBy: { period: "desc" } });

  if (!latestScore) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Ranking trenerów</h1>
        <p className="text-muted-brand text-sm">
          Jeszcze żaden wynik nie został policzony - job liczący wyniki uruchamia się 1. dnia
          miesiąca.
        </p>
      </div>
    );
  }

  const period = latestScore.period;

  const [scores, trainers] = await Promise.all([
    prisma.trainerScore.findMany({
      where: { period },
      include: { trainer: { include: { user: true, location: true } } },
    }),
    prisma.trainer.findMany({
      where: { active: true },
      include: { user: true, location: true },
    }),
  ]);

  const scoredTrainerIds = new Set(scores.map((s) => s.trainerId));
  const missing = trainers.filter((t) => !scoredTrainerIds.has(t.id));

  const sorted = [...scores].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const leaderIds = new Set(
    findLeaderTrainerIds(scores.map((s) => ({ trainerId: s.trainerId, score: s.score }))),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Ranking trenerów</h1>
        <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
          Okres {period} · próg premii {BONUS_THRESHOLD_SCORE} · policzono{" "}
          {formatDate(latestScore.computedAt)}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {sorted.map((s) => (
          <li key={s.id} className="border-line bg-surface rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text font-medium">
                  {s.trainer.user.name}
                  {leaderIds.has(s.trainerId) ? (
                    <span className="bg-jade/10 text-jade ml-2 rounded-full px-2 py-0.5 font-mono text-xs uppercase">
                      Lider
                    </span>
                  ) : null}
                  {s.score != null && s.score >= BONUS_THRESHOLD_SCORE ? (
                    <span className="bg-brand-red/10 text-brand-red ml-2 rounded-full px-2 py-0.5 font-mono text-xs uppercase">
                      Premia
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-brand font-mono text-xs">{s.trainer.location.name}</p>
              </div>
              {s.score != null ? (
                <p className="font-display text-brand-red text-3xl">{s.score}</p>
              ) : (
                <p className="text-amber font-mono text-xs tracking-widest uppercase">
                  Za mało danych ({s.maturedCount}/{MIN_MATURED_COUNT})
                </p>
              )}
            </div>

            {s.score != null ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <MetricBar
                    label="Retencja"
                    ratio={s.ret90Normalized}
                    valueLabel={formatPercent(s.ret90Normalized)}
                  />
                  <MetricBar
                    label="Ocena"
                    ratio={ratingToBarRatio(s.rating)}
                    valueLabel={s.rating != null ? `${s.rating.toFixed(1)}/5` : "-"}
                  />
                  <MetricBar
                    label="Terminowość"
                    ratio={s.alertRate}
                    valueLabel={formatPercent(s.alertRate)}
                  />
                  <MetricBar
                    label="Onboarding"
                    ratio={s.onboardingRate}
                    valueLabel={formatPercent(s.onboardingRate)}
                  />
                </div>
                <ScoreProgressBar score={s.score} />
              </>
            ) : null}
          </li>
        ))}
        {missing.map((t) => (
          <li
            key={t.id}
            className="border-line bg-surface text-muted-brand rounded-md border p-4 text-sm"
          >
            {t.user.name} ({t.location.name}) - brak jeszcze wyniku dla tego okresu.
          </li>
        ))}
      </ul>

      <details className="border-line bg-surface mt-2 rounded-md border">
        <summary className="text-text flex cursor-pointer list-none items-center gap-2 p-4 font-mono text-xs tracking-widest uppercase [&::-webkit-details-marker]:hidden">
          <Info className="text-brand-red size-4" />
          Wyjaśnienie statystyk
        </summary>
        <div className="border-line text-muted-brand flex max-w-[72ch] flex-col gap-5 border-t p-4 text-sm">
          <div>
            <p className="text-text mb-2 font-mono text-xs tracking-widest uppercase">
              Skala kolorów pasków
            </p>
            <div className="flex flex-wrap gap-4">
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full" style={{ backgroundColor: colorForRatio(0) }} />
                0-39% - nisko
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full" style={{ backgroundColor: colorForRatio(0.5) }} />
                40-69% - średnio
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-full" style={{ backgroundColor: colorForRatio(1) }} />
                70-100% - wysoko
              </span>
            </div>
            <p className="mt-1">Kolor zmienia się płynnie, powyższe progi to tylko punkty orientacyjne.</p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Wynik (0-100) i jego składowe
            </p>
            <p>
              Liczony raz w miesiącu, 1. dnia, za okres poprzedni - to zdjęcie migawkowe, nie licznik
              na żywo. To ważona suma czterech pasków: <b>Retencja</b> (45% wagi), <b>Ocena</b> (20%),
              <b> Terminowość</b> (20%) i <b>Onboarding</b> (15%). „Za mało danych (X/5)" oznacza, że
              trener ma mniej niż 5 klientów w dojrzałej kohorcie (przypisanych do niego i zapisanych
              min. 90 dni temu) - to brak wystarczającej próbki, nie ocena negatywna.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Retencja tutaj ≠ Retencja 90 dni na ekranie „Retencja"
            </p>
            <p>
              To liczba <b>względna</b>: retencja tego trenera podzielona przez średnią retencję
              całego klubu w tym samym segmencie (dzieci/dorośli), ograniczona do 100%. 100% = trener
              trzyma się poziomu średniej klubowej (albo lepiej). Np. retencja 60% przy średniej
              klubowej 75% daje tu <b>80%</b> - nie 60%.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">Ocena, Terminowość, Onboarding</p>
            <p>
              <b>Ocena</b> - średnia z ocen klientów (1-5) po zajęciach tego trenera z ostatnich 90 dni;
              brak ocen liczy się neutralnie, nie jako kara. <b>Terminowość</b> - % zadań retencyjnych
              zamkniętych przed terminem w ostatnich 90 dniach. <b>Onboarding</b> - % już wymagalnych
              etapów wdrożenia nowego klienta, które trener ukończył na czas.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">Postęp do premii</p>
            <p>
              Duży pasek pod każdym trenerem pokazuje Wynik na skali 0-100 z kreskowanym znacznikiem
              progu premii ({BONUS_THRESHOLD_SCORE}). Po przekroczeniu progu pasek płynie dalej w prawo
              (zakreskowany fragment) - to pokazuje, że premia to nie sufit, wynik może dalej rosnąć
              aż do 100.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
