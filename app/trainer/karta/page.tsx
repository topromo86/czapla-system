import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { BONUS_THRESHOLD_SCORE, MIN_MATURED_COUNT } from "@/lib/domain/scoring";
import { formatDate } from "@/lib/format";

function formatPercent(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

// "Moja karta" (SPEC.md sekcja 3, rola trener): KPI, wynik, pozycja w
// rankingu. Celowo NIE pokazuje wyników ani nazwisk innych trenerów - tylko
// własną pozycję jako liczbę (SPEC.md: "Nie widzi wyników innych trenerów
// poza własną pozycją w rankingu").
export default async function TrainerScoreCardPage() {
  const { trainer } = await requireTrainerSelf();

  const myLatest = await prisma.trainerScore.findFirst({
    where: { trainerId: trainer.id },
    orderBy: { period: "desc" },
  });

  if (!myLatest) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Moja karta</h1>
        <p className="text-muted-brand text-sm">
          Wynik jeszcze nie został policzony - job liczący wyniki uruchamia się 1. dnia miesiąca.
        </p>
      </div>
    );
  }

  let position: { rank: number; of: number } | null = null;
  if (myLatest.score != null) {
    const periodScores = await prisma.trainerScore.findMany({
      where: { period: myLatest.period, score: { not: null } },
      orderBy: { score: "desc" },
      select: { trainerId: true },
    });
    const rank = periodScores.findIndex((s) => s.trainerId === trainer.id) + 1;
    if (rank > 0) position = { rank, of: periodScores.length };
  }

  const isBonusEligible = myLatest.score != null && myLatest.score >= BONUS_THRESHOLD_SCORE;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Moja karta</h1>
        <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
          Okres {myLatest.period} · policzono {formatDate(myLatest.computedAt)}
        </p>
      </div>

      <section className="border-line bg-surface rounded-md border p-6 text-center">
        {myLatest.score != null ? (
          <>
            <p className="font-display text-brand-red text-5xl">{myLatest.score}</p>
            <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
              / 100
            </p>
            {position ? (
              <p className="text-text mt-3 text-sm">
                Pozycja w rankingu: <span className="font-medium">{position.rank}</span> /{" "}
                {position.of}
              </p>
            ) : null}
            {isBonusEligible ? (
              <p className="text-jade mt-2 font-mono text-xs tracking-widest uppercase">
                Powyżej progu premii ({BONUS_THRESHOLD_SCORE})
              </p>
            ) : (
              <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
                Próg premii: {BONUS_THRESHOLD_SCORE}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-amber font-display text-2xl">Za mało danych</p>
            <p className="text-muted-brand mt-2 text-sm">
              {myLatest.maturedCount} / {MIN_MATURED_COUNT} dojrzałych klientów (co najmniej 90 dni
              od dołączenia). Wynik pojawi się, gdy próg zostanie osiągnięty.
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Składowe wyniku
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="border-line bg-surface flex items-center justify-between rounded-md border p-3">
            <span className="text-text">Retencja 90 dni (znormalizowana względem klubu)</span>
            <span className="font-mono text-sm">{formatPercent(myLatest.ret90Normalized)}</span>
          </li>
          <li className="border-line bg-surface flex items-center justify-between rounded-md border p-3">
            <span className="text-text">Średnia ocena zajęć</span>
            <span className="font-mono text-sm">
              {myLatest.rating != null ? myLatest.rating.toFixed(1) : "-"} / 5
            </span>
          </li>
          <li className="border-line bg-surface flex items-center justify-between rounded-md border p-3">
            <span className="text-text">Zadania zamknięte w terminie</span>
            <span className="font-mono text-sm">{formatPercent(myLatest.alertRate)}</span>
          </li>
          <li className="border-line bg-surface flex items-center justify-between rounded-md border p-3">
            <span className="text-text">Ukończony onboarding podopiecznych</span>
            <span className="font-mono text-sm">{formatPercent(myLatest.onboardingRate)}</span>
          </li>
        </ul>
        <p className="text-muted-brand mt-2 text-xs">
          Wynik = 45% retencja + 20% ocena + 20% terminowość zadań + 15% onboarding.
        </p>
      </section>
    </div>
  );
}
