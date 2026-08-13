import Link from "next/link";
import { Info } from "lucide-react";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  formatMinutes,
  formatMonth,
  monthRange,
  parseMonthKey,
  SESSION_KIND_LABEL,
} from "@/lib/domain/payroll";
import { bonusForScore } from "@/lib/domain/scoring";
import { runsSessionWhere } from "@/lib/domain/substitute";
import { todayInTimeZone } from "@/lib/domain/time";
import { getClubSettings } from "@/lib/services/settings";
import { trainerPayout } from "@/lib/services/payroll";
import { formatDayTime, formatMoney } from "@/lib/format";
import { PROSE_WIDTH } from "../../shell";

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default async function TrainerPayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ miesiac?: string }>;
}) {
  const { trainer } = await requireTrainerSelf();
  const { miesiac } = await searchParams;

  const now = new Date();
  const today = todayInTimeZone(now);
  const selected = (miesiac ? parseMonthKey(miesiac) : null) ?? {
    year: today.year,
    month: today.month,
  };

  const selectedKey = `${selected.year}-${String(selected.month).padStart(2, "0")}`;

  const [summary, settings, scoreRow] = await Promise.all([
    trainerPayout(trainer.id, selected.year, selected.month, now),
    getClubSettings(),
    prisma.trainerScore.findFirst({ where: { trainerId: trainer.id, period: selectedKey } }),
  ]);

  const score = scoreRow?.score ?? null;
  const bonusGross = bonusForScore(score, settings.bonusThresholdScore, settings.bonusAmountGross);
  const payoutWithBonus = summary.totalGross + bonusGross;

  const range = monthRange(selected.year, selected.month);
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: range.startsAt, lt: range.endsAt },
      ...runsSessionWhere(trainer.id),
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
  });

  const prev = shiftMonth(selected.year, selected.month, -1);
  const next = shiftMonth(selected.year, selected.month, 1);
  const monthLink = (m: { year: number; month: number }) =>
    `/trainer/wynagrodzenie?miesiac=${m.year}-${String(m.month).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Moje wynagrodzenie</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Zajęcia poprowadzone w tym miesiącu i szacunkowa kwota na koniec miesiąca.
        </p>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          {formatMonth(selected.year, selected.month)}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={monthLink(prev)}
            className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
          >
            ← Poprzedni
          </Link>
          <Link
            href={monthLink(next)}
            className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
          >
            Następny →
          </Link>
        </div>
      </section>

      <section className="flex flex-wrap gap-8">
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Zarobione do dziś
          </h2>
          <p className="font-display text-3xl">{formatMoney(summary.earnedGross)}</p>
          <p className="text-muted-brand font-mono text-xs">
            {summary.doneCount} zajęć · {formatMinutes(summary.doneMinutes)}
          </p>
        </div>
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Jeszcze zaplanowane
          </h2>
          <p className="font-display text-3xl">{formatMoney(summary.forecastGross)}</p>
          <p className="text-muted-brand font-mono text-xs">
            {summary.upcomingCount} zajęć · {formatMinutes(summary.upcomingMinutes)}
          </p>
        </div>
        {settings.bonusAmountGross > 0 ? (
          <div>
            <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Premia</h2>
            <p
              className={`font-display text-3xl ${bonusGross > 0 ? "text-jade" : "text-muted-brand"}`}
            >
              {formatMoney(bonusGross > 0 ? bonusGross : settings.bonusAmountGross)}
            </p>
            <p className="text-muted-brand font-mono text-xs">
              {bonusGross > 0 ? "wypracowana" : "do wypracowania"}
            </p>
          </div>
        ) : null}
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Szacunkowo na koniec miesiąca
          </h2>
          <p className="font-display text-brand-red text-3xl">{formatMoney(payoutWithBonus)}</p>
          {bonusGross > 0 ? (
            <p className="text-muted-brand font-mono text-xs">
              w tym premia {formatMoney(bonusGross)}
            </p>
          ) : null}
        </div>
      </section>

      {settings.bonusAmountGross > 0 ? (
        <section
          className={`rounded-md border p-4 ${
            bonusGross > 0 ? "border-jade/40 bg-jade/5" : "border-line bg-surface"
          }`}
        >
          {bonusGross > 0 ? (
            <p className="text-text text-sm">
              <b>Premia wypracowana.</b> Twój wynik za ten miesiąc to {score} pkt, próg wynosi{" "}
              {settings.bonusThresholdScore} pkt - do wypłaty dochodzi{" "}
              {formatMoney(settings.bonusAmountGross)}.
            </p>
          ) : score != null ? (
            <p className="text-text text-sm">
              Twój wynik za ten miesiąc to <b>{score} pkt</b>, próg premii wynosi{" "}
              {settings.bonusThresholdScore} pkt. Brakuje {settings.bonusThresholdScore - score} pkt
              do premii {formatMoney(settings.bonusAmountGross)}.
            </p>
          ) : scoreRow ? (
            <p className="text-text text-sm">
              Wynik za ten miesiąc nie został policzony - za mało danych w Twojej kohorcie. Premia (
              {formatMoney(settings.bonusAmountGross)}) nie jest doliczana.
            </p>
          ) : (
            <p className="text-text text-sm">
              Wynik za ten miesiąc <b>jeszcze nie został policzony</b> - liczy się go 1. dnia
              miesiąca. Premia {formatMoney(settings.bonusAmountGross)} przy progu{" "}
              {settings.bonusThresholdScore} pkt zostanie doliczona dopiero po przeliczeniu.
            </p>
          )}
          <p className="text-muted-brand mt-1 text-xs">
            Na co wpływa wynik, sprawdzisz w zakładce „Moja karta”.
          </p>
        </section>
      ) : null}

      {summary.sessionsWithoutRate > 0 ? (
        <p className="border-amber/40 bg-amber/5 text-text rounded-md border p-3 text-sm">
          <b>{summary.sessionsWithoutRate}</b> zajęć nie ma jeszcze ustawionej stawki i liczy się
          jako 0 zł. Zgłoś to właścicielowi - kwota powyżej jest o tyle zaniżona.
        </p>
      ) : null}

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Według rodzaju zajęć
        </h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {summary.byKind.map((kind) => (
            <div key={kind.kind} className="border-line bg-surface rounded-md border p-4">
              <p className="text-text font-medium">{SESSION_KIND_LABEL[kind.kind]}</p>
              <p className="text-muted-brand mt-1 font-mono text-xs">
                stawka:{" "}
                {kind.currentRateGross != null
                  ? `${formatMoney(kind.currentRateGross)} za zajęcia`
                  : "nie ustawiona"}
              </p>

              <dl className="mt-3 flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-brand">Odbyte</dt>
                  <dd className="text-text">
                    {kind.doneCount} · {formatMinutes(kind.doneMinutes)} ·{" "}
                    <b>{formatMoney(kind.earnedGross)}</b>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-brand">Zaplanowane</dt>
                  <dd className="text-muted-brand">
                    {kind.upcomingCount} · {formatMinutes(kind.upcomingMinutes)} ·{" "}
                    {formatMoney(kind.forecastGross)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Twoje zajęcia w tym miesiącu ({sessions.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-1">
          {sessions.map((s) => {
            const done = s.startsAt <= now;
            const cancelled = s.status === "CANCELLED";
            return (
              <li
                key={s.id}
                className={`border-line-soft flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm ${
                  cancelled ? "opacity-50" : ""
                }`}
              >
                <span className="text-text">
                  {s.name}
                  {s.kind === "INDIVIDUAL" ? (
                    <span className="bg-jade/10 text-jade ml-2 rounded-full px-2 py-0.5 font-mono text-xs uppercase">
                      Indywidualne
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-brand font-mono text-xs">
                  {formatDayTime(s.startsAt)} · {s.location.name} ·{" "}
                  {cancelled ? "odwołane" : done ? "odbyte" : "zaplanowane"}
                </span>
              </li>
            );
          })}
          {sessions.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak zajęć w tym miesiącu.</li>
          ) : null}
        </ul>
      </section>

      <details className="border-line bg-surface rounded-md border">
        <summary className="text-text flex cursor-pointer list-none items-center gap-2 p-4 font-mono text-xs tracking-widest uppercase [&::-webkit-details-marker]:hidden">
          <Info className="text-brand-red size-4" />
          Jak liczona jest ta kwota
        </summary>
        <div
          className={`border-line text-muted-brand flex ${PROSE_WIDTH} flex-col gap-5 border-t p-4 text-sm`}
        >
          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Stawka za zajęcia, nie za godzinę
            </p>
            <p>
              Płatne są poprowadzone zajęcia, osobno grupowe i indywidualne, według stawki ustalonej
              przez właściciela. Godziny widzisz obok, żeby mieć obraz nakładu pracy, ale kwota nie
              jest przez nie mnożona.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Co się liczy
            </p>
            <p>
              Zajęcia, które się odbyły i nie zostały odwołane. Jeśli prowadziłeś zajęcia jako
              <b> zastępstwo</b>, liczą się Tobie, a nie osobie z grafiku - i odwrotnie, gdy ktoś
              zastąpił Ciebie.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              ❗️ „Szacunkowo” znaczy szacunkowo
            </p>
            <p>
              Kwota na koniec miesiąca dolicza zajęcia jeszcze zaplanowane. Jeśli któreś zostaną
              odwołane albo dojdą nowe, wynik się zmieni. Pewna jest tylko część „zarobione do
              dziś”. Ostateczne rozliczenie robi właściciel.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
