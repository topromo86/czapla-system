import { Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { findLeaderTrainerIds, isBonusEligible, MIN_MATURED_COUNT } from "@/lib/domain/scoring";
import { colorForRatio } from "@/lib/domain/score-color";
import { getClubSettings } from "@/lib/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/format";
import { MetricBar, ratingToBarRatio, ScoreProgressBar } from "./metric-bar";
import { updateBonusSettingsAction } from "./actions";

function formatPercent(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

// Ustawienia premii są osobnym komponentem, bo pokazujemy je także wtedy, gdy
// nie ma jeszcze żadnego policzonego wyniku - właściciel musi móc ustalić próg
// i kwotę zanim ranking ruszy, a nie dopiero po pierwszym przeliczeniu.
function BonusSettingsForm({
  thresholdScore,
  amountGross,
}: {
  thresholdScore: number;
  amountGross: number;
}) {
  return (
    <section>
      <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Premia</h2>
      <form
        action={updateBonusSettingsAction}
        className="border-line bg-surface mt-2 flex flex-wrap items-end gap-3 rounded-md border p-4"
      >
        <div className="w-32">
          <Label htmlFor="bonusThresholdScore">Próg (0-100)</Label>
          <Input
            id="bonusThresholdScore"
            name="bonusThresholdScore"
            type="number"
            min="0"
            max="100"
            required
            defaultValue={thresholdScore}
            className="border-line bg-surface-2"
          />
        </div>
        <div className="w-40">
          <Label htmlFor="bonusAmount">Kwota premii (zł)</Label>
          <Input
            id="bonusAmount"
            name="bonusAmount"
            required
            defaultValue={(amountGross / 100).toFixed(2).replace(".", ",")}
            placeholder="500"
            className="border-line bg-surface-2"
          />
        </div>
        <Button type="submit">Zapisz premię</Button>

        <p className="text-muted-brand w-full text-xs">
          Trener, którego wynik osiągnie próg, dostaje <b>całą kwotę</b> - premia jest
          zero-jedynkowa, bez proporcji. Kwota pojawia się przy jego wypłacie w zakładce
          Wynagrodzenia i u samego trenera. Ustaw 0 zł, jeśli chcesz na razie tylko oznaczać próg,
          bez wypłacania.
        </p>
      </form>
    </section>
  );
}

// Ranking trenerów (SPEC.md sekcja 3, ekran właściciela): karty punktowe,
// próg premii, oznaczenie "za mało danych". W odróżnieniu od /trainer/karta -
// tu widać wszystkich, bo to ekran właściciela, nie trenera.
export default async function AdminRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("ADMIN");
  const { error } = await searchParams;

  const [latestScore, settings] = await Promise.all([
    prisma.trainerScore.findFirst({ orderBy: { period: "desc" } }),
    getClubSettings(),
  ]);

  const errorBanner = error ? (
    <p role="alert" className="border-red/40 bg-red/5 text-red rounded-md border p-3 text-sm">
      {error}
    </p>
  ) : null;

  if (!latestScore) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Ranking trenerów</h1>
        {errorBanner}
        <p className="text-muted-brand text-sm">
          Jeszcze żaden wynik nie został policzony - job liczący wyniki uruchamia się 1. dnia
          miesiąca. Premię możesz ustawić już teraz.
        </p>
        <BonusSettingsForm
          thresholdScore={settings.bonusThresholdScore}
          amountGross={settings.bonusAmountGross}
        />
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
          Okres {period} · próg premii {settings.bonusThresholdScore} ·{" "}
          {settings.bonusAmountGross > 0 ? formatMoney(settings.bonusAmountGross) : "kwota nieustawiona"} ·
          policzono {formatDate(latestScore.computedAt)}
        </p>
      </div>

      {errorBanner}

      <BonusSettingsForm
        thresholdScore={settings.bonusThresholdScore}
        amountGross={settings.bonusAmountGross}
      />

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
                  {isBonusEligible(s.score, settings.bonusThresholdScore) ? (
                    <span className="bg-brand-red/10 text-brand-red ml-2 rounded-full px-2 py-0.5 font-mono text-xs uppercase">
                      Premia
                      {settings.bonusAmountGross > 0
                        ? ` ${formatMoney(settings.bonusAmountGross)}`
                        : ""}
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
                <ScoreProgressBar score={s.score} threshold={settings.bonusThresholdScore} />
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
              progu premii ({settings.bonusThresholdScore}). Po przekroczeniu progu pasek płynie dalej w prawo
              (zakreskowany fragment) - to pokazuje, że premia to nie sufit, wynik może dalej rosnąć
              aż do 100.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
