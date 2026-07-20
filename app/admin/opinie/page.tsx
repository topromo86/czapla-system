import Link from "next/link";
import { Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { averageScoreColor, RATING_LABEL, scoreColor } from "@/lib/domain/rating";
import { formatDayTime } from "@/lib/format";
import { PROSE_WIDTH } from "../../shell";

export default async function AdminOpinionsPage({
  searchParams,
}: {
  searchParams: Promise<{ trener?: string; tylkoOpinie?: string }>;
}) {
  await requireRole("ADMIN");
  const { trener, tylkoOpinie } = await searchParams;

  const onlyWithComment = tylkoOpinie === "1";

  const [trainers, ratings, aggregate] = await Promise.all([
    prisma.trainer.findMany({
      where: { active: true },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    // ŚWIADOMIE bez memberId i bez relacji `member`: dane o tym, kto wystawił
    // ocenę, nie opuszczają bazy. Obietnica anonimowości złożona klientowi na
    // ekranie oceny jest tu egzekwowana na poziomie zapytania, a nie tylko
    // przez pominięcie pola w widoku.
    prisma.rating.findMany({
      where: {
        ...(onlyWithComment ? { comment: { not: null } } : {}),
        ...(trener
          ? {
              session: {
                OR: [{ trainerId: trener, substituteTrainerId: null }, { substituteTrainerId: trener }],
              },
            }
          : {}),
      },
      select: {
        id: true,
        score: true,
        comment: true,
        createdAt: true,
        session: {
          select: {
            name: true,
            startsAt: true,
            kind: true,
            category: { select: { name: true } },
            location: { select: { name: true } },
            trainer: { select: { user: { select: { name: true } } } },
            substituteTrainer: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.rating.aggregate({ _avg: { score: true }, _count: true }),
  ]);

  const withComment = ratings.filter((r) => r.comment).length;
  const average = aggregate._avg.score;

  function linkWith(overrides: Record<string, string | null>): string {
    const query = new URLSearchParams();
    if (trener) query.set("trener", trener);
    if (onlyWithComment) query.set("tylkoOpinie", "1");
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `/admin/opinie?${qs}` : "/admin/opinie";
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Opinie o zajęciach</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Oceny i komentarze klubowiczów. Widoczne wyłącznie dla Ciebie - trenerzy nie mają do nich
          dostępu.
        </p>
      </div>

      <section className="flex flex-wrap gap-8">
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Średnia ocena
          </h2>
          <p className="font-display text-3xl" style={{ color: averageScoreColor(average) }}>
            {average != null ? average.toFixed(2) : "-"}
          </p>
        </div>
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Wszystkich ocen
          </h2>
          <p className="font-display text-3xl">{aggregate._count}</p>
        </div>
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Z opinią (w widoku)
          </h2>
          <p className="font-display text-3xl">{withComment}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-brand w-20 font-mono text-xs tracking-widest uppercase">
            Trener
          </span>
          <Link
            href={linkWith({ trener: null })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              !trener ? "border-brand-red text-brand-red font-medium" : "border-line bg-surface text-text"
            }`}
          >
            Wszyscy
          </Link>
          {trainers.map((t) => (
            <Link
              key={t.id}
              href={linkWith({ trener: t.id })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                trener === t.id
                  ? "border-brand-red text-brand-red font-medium"
                  : "border-line bg-surface text-text"
              }`}
            >
              {t.user.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-brand w-20 font-mono text-xs tracking-widest uppercase">
            Pokaż
          </span>
          <Link
            href={linkWith({ tylkoOpinie: null })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              !onlyWithComment
                ? "border-brand-red text-brand-red font-medium"
                : "border-line bg-surface text-text"
            }`}
          >
            Wszystkie oceny
          </Link>
          <Link
            href={linkWith({ tylkoOpinie: "1" })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              onlyWithComment
                ? "border-brand-red text-brand-red font-medium"
                : "border-line bg-surface text-text"
            }`}
          >
            Tylko z opinią
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Oceny ({ratings.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {ratings.map((rating) => {
            const leadBy =
              rating.session.substituteTrainer?.user.name ?? rating.session.trainer.user.name;
            const isSubstitute = rating.session.substituteTrainer != null;

            return (
              <li key={rating.id} className="border-line bg-surface rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-label={`Ocena ${rating.score} z 5`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-md font-mono text-base font-bold text-white"
                    style={{ backgroundColor: scoreColor(rating.score) }}
                  >
                    {rating.score}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-text font-medium">
                      {rating.session.name}
                      {rating.session.kind === "INDIVIDUAL" ? (
                        <span className="bg-jade/10 text-jade ml-2 rounded-full px-2 py-0.5 font-mono text-xs uppercase">
                          Indywidualny
                        </span>
                      ) : null}
                    </p>

                    <p className="text-muted-brand mt-0.5 font-mono text-xs">
                      {formatDayTime(rating.session.startsAt)} · {rating.session.location.name} ·{" "}
                      {leadBy}
                      {isSubstitute ? " (zastępstwo)" : ""}
                      {rating.session.category ? ` · ${rating.session.category.name}` : ""}
                    </p>

                    <p className="text-muted-brand mt-0.5 font-mono text-xs">
                      {RATING_LABEL[rating.score]} · wystawiono {formatDayTime(rating.createdAt)}
                    </p>

                    {rating.comment ? (
                      <p className="border-line-soft text-text mt-2 border-l-2 pl-3 text-sm whitespace-pre-line">
                        {rating.comment}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}

          {ratings.length === 0 ? (
            <li className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
              Brak ocen spełniających wybrane filtry.
            </li>
          ) : null}
        </ul>
      </section>

      <details className="border-line bg-surface rounded-md border">
        <summary className="text-text flex cursor-pointer list-none items-center gap-2 p-4 font-mono text-xs tracking-widest uppercase [&::-webkit-details-marker]:hidden">
          <Info className="text-brand-red size-4" />
          Anonimowość opinii
        </summary>
        <div
          className={`border-line text-muted-brand flex ${PROSE_WIDTH} flex-col gap-5 border-t p-4 text-sm`}
        >
          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Co widzisz, a czego nie
            </p>
            <p>
              Widzisz ocenę, treść opinii i pełny kontekst zajęć: nazwę, rodzaj, datę z godziną,
              lokalizację i osobę prowadzącą (z zaznaczeniem zastępstwa). <b>Nie widzisz, kto
              wystawił ocenę</b> - te dane nie są w ogóle pobierane z bazy na ten ekran.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              Trenerzy nie mają tu dostępu
            </p>
            <p>
              Ekran jest dostępny wyłącznie dla roli właściciela. Trener widzi swoją średnią ocenę
              na „Mojej karcie" i w Rankingu, ale nigdy pojedynczych opinii ani ich treści.
            </p>
          </div>

          <div>
            <p className="text-text mb-1 font-mono text-xs tracking-widest uppercase">
              ❗️ Gdzie anonimowość ma granice
            </p>
            <p>
              Baza nadal wie, kto ocenił które zajęcia - to konieczne, żeby jedna osoba nie
              wystawiła dziesięciu ocen tym samym zajęciom. Ukrycie działa na poziomie aplikacji,
              nie kryptografii: osoba z bezpośrednim dostępem do bazy mogłaby to powiązać.
            </p>
            <p className="mt-2">
              Drugie ograniczenie jest praktyczne: jeśli na zajęciach było troje ludzi i przyszła
              jedna opinia, autor bywa rozpoznawalny mimo ukrytego nazwiska. Warto o tym pamiętać,
              zanim skonfrontujesz trenera z pojedynczym komentarzem.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
