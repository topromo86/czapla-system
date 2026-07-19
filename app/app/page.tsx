import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { hasRequiredConsents, requiredConsentKeys } from "@/lib/domain/booking";
import {
  bookingHorizonEnd,
  describeHorizon,
  startOfWeek,
  weekDays,
} from "@/lib/domain/schedule";
import { addCalendarDays, todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";
import { getClubSettings } from "@/lib/services/settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WeekPlanner, type PlannerSession } from "./planner";
import { rateSessionAction, reportAbsenceAction } from "./actions";

const ABSENCE_REASON_LABEL: Record<string, string> = { INJURY: "Kontuzja", OTHER: "Inny powód" };

const RATING_DELAY_MS = 3_600_000;

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_BOOKED: "Jesteś już zapisany na te zajęcia.",
  SESSION_CANCELLED: "Te zajęcia zostały odwołane.",
  ALREADY_STARTED: "Te zajęcia już się rozpoczęły.",
  MISSING_CONSENTS: "Brakuje wymaganych zgód - uzupełnij je w zakładce Zgody.",
  NO_ACTIVE_PASS: "Brak aktywnego karnetu - skontaktuj się z klubem.",
  AGE_NOT_ELIGIBLE: "Wiek nie pasuje do tej grupy zajęciowej.",
};

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function isoDate(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    member?: string;
    location?: string;
    rodzaj?: string;
    tydzien?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const members = await getAccessibleMembers();
  if (members.length === 0) return null; // layout już pokazał komunikat

  const activeMember = members.find((m) => m.id === params.member) ?? members[0];
  const [locations, categories, settings] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.classCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getClubSettings(),
  ]);
  const activeLocationId = params.location ?? activeMember.homeLocationId;
  const activeCategoryId = params.rodzaj ?? null;

  const grantedConsents = await prisma.consent.findMany({
    where: { memberId: activeMember.id, revokedAt: null },
    include: { consentType: true },
  });
  const grantedKeys = new Set(grantedConsents.map((c) => c.consentType.key));
  const missingConsents = !hasRequiredConsents(
    grantedKeys,
    requiredConsentKeys(activeMember.isMinor),
  );

  const now = new Date();
  const horizonEnd = bookingHorizonEnd({
    mode: settings.bookingHorizonMode,
    days: settings.bookingHorizonDays,
    now,
  });

  // Który tydzień pokazujemy. Domyślnie bieżący; strzałki przesuwają widok,
  // ale nigdy przed tydzień bieżący - grafiku wstecz klient nie potrzebuje.
  const currentWeekStart = startOfWeek(todayInTimeZone(now));
  const requested = params.tydzien?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const requestedWeekStart = requested
    ? startOfWeek({
        year: Number(requested[1]),
        month: Number(requested[2]),
        day: Number(requested[3]),
      })
    : currentWeekStart;
  const weekStart =
    isoDate(requestedWeekStart) < isoDate(currentWeekStart) ? currentWeekStart : requestedWeekStart;

  const weekStartUtc = zonedTimeToUtc(weekStart.year, weekStart.month, weekStart.day, 0, 0);
  const nextWeekStart = addCalendarDays(weekStart, 7);
  const weekEndUtc = zonedTimeToUtc(
    nextWeekStart.year,
    nextWeekStart.month,
    nextWeekStart.day,
    0,
    0,
  );
  const prevWeekStart = addCalendarDays(weekStart, -7);
  const canGoBack = isoDate(prevWeekStart) >= isoDate(currentWeekStart);

  const activeAbsenceReport = await prisma.absenceReport.findFirst({
    where: { memberId: activeMember.id, resolvedAt: null },
    orderBy: { reportedAt: "desc" },
  });

  const pendingRatings = await prisma.attendance.findMany({
    where: {
      memberId: activeMember.id,
      checkedInAt: { lte: new Date(now.getTime() - RATING_DELAY_MS) },
      session: { ratings: { none: { memberId: activeMember.id } } },
    },
    include: { session: true },
    orderBy: { checkedInAt: "desc" },
    take: 3,
  });

  const sessions = await prisma.session.findMany({
    where: {
      locationId: activeLocationId,
      startsAt: { gte: weekStartUtc, lt: weekEndUtc },
      ...(activeCategoryId ? { categoryId: activeCategoryId } : {}),
    },
    include: {
      template: true,
      category: true,
      trainer: { include: { user: true } },
      bookings: true,
    },
    orderBy: { startsAt: "asc" },
  });

  // Grupy dziecięce widzą tylko niepełnoletni i odwrotnie - ta sama reguła co
  // wcześniej, tylko przeniesiona do plannera.
  const relevant = sessions.filter((s) =>
    s.template ? s.template.isKids === activeMember.isMinor : true,
  );

  const plannerSessions: PlannerSession[] = relevant.map((s) => {
    const myBooking = s.bookings.find(
      (b) => b.memberId === activeMember.id && (b.status === "BOOKED" || b.status === "WAITLIST"),
    );
    return {
      id: s.id,
      name: s.name,
      startsAt: s.startsAt,
      capacity: s.capacity,
      status: s.status,
      categoryName: s.category?.name ?? null,
      trainerName: s.trainer.user.name,
      bookedCount: s.bookings.filter((b) => b.status === "BOOKED").length,
      myBookingId: myBooking?.id ?? null,
      myBookingStatus: myBooking?.status ?? null,
    };
  });

  function linkWith(overrides: Record<string, string | null>): string {
    const query = new URLSearchParams();
    query.set("member", activeMember.id);
    query.set("location", activeLocationId);
    if (activeCategoryId) query.set("rodzaj", activeCategoryId);
    query.set("tydzien", isoDate(weekStart));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `/app?${query.toString()}`;
  }

  const returnTo = linkWith({});
  const visibleDays = weekDays(weekStart);
  const weekLabel = `${visibleDays[0].day}.${String(visibleDays[0].month).padStart(2, "0")} - ${visibleDays[6].day}.${String(visibleDays[6].month).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-6">
      {members.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={linkWith({ member: m.id })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                m.id === activeMember.id
                  ? "border-brand-red text-brand-red font-medium"
                  : "border-line bg-surface text-text"
              }`}
            >
              {m.firstName}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-brand w-20 font-mono text-xs tracking-widest uppercase">
            Miejsce
          </span>
          {locations.map((loc) => (
            <Link
              key={loc.id}
              href={linkWith({ location: loc.id })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                loc.id === activeLocationId
                  ? "border-brand-red text-brand-red font-medium"
                  : "border-line bg-surface text-text"
              }`}
            >
              {loc.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-brand w-20 font-mono text-xs tracking-widest uppercase">
            Rodzaj
          </span>
          <Link
            href={linkWith({ rodzaj: null })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activeCategoryId === null
                ? "border-brand-red text-brand-red font-medium"
                : "border-line bg-surface text-text"
            }`}
          >
            Wszystkie
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={linkWith({ rodzaj: category.id })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                category.id === activeCategoryId
                  ? "border-brand-red text-brand-red font-medium"
                  : "border-line bg-surface text-text"
              }`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </div>

      {params.error ? (
        <p role="alert" className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          {ERROR_MESSAGES[params.error] ?? "Nie udało się wykonać akcji."}
        </p>
      ) : null}

      {missingConsents ? (
        <p className="border-brand-red/40 bg-brand-red/10 text-text rounded-md border p-3 text-sm">
          Brakuje kompletu wymaganych zgód dla {activeMember.firstName} - uzupełnij je w zakładce{" "}
          <Link href={`/app/zgody?member=${activeMember.id}`} className="text-brand-red underline">
            Zgody
          </Link>
          , inaczej zapis na zajęcia się nie powiedzie.
        </p>
      ) : null}

      {pendingRatings.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Oceń ostatnie zajęcia
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingRatings.map((a) => (
              <li
                key={a.id}
                className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-text font-medium">{a.session.name}</p>
                  <p className="text-muted-brand font-mono text-xs">{formatDay(a.session.startsAt)}</p>
                </div>
                <form action={rateSessionAction} className="flex items-center gap-1">
                  <input type="hidden" name="memberId" value={activeMember.id} />
                  <input type="hidden" name="sessionId" value={a.sessionId} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button key={n} type="submit" name="score" value={String(n)} variant="outline" size="sm">
                      {n}
                    </Button>
                  ))}
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Nieobecność / kontuzja
        </h2>
        {activeAbsenceReport ? (
          <p className="border-line bg-surface rounded-md border p-3 text-sm">
            Zgłoszono: {ABSENCE_REASON_LABEL[activeAbsenceReport.reason]}
            {activeAbsenceReport.note ? ` - ${activeAbsenceReport.note}` : ""}. Trener widzi to
            zgłoszenie i wie, dlaczego {activeMember.firstName} nie trenuje.
          </p>
        ) : (
          <form
            action={reportAbsenceAction}
            className="border-line bg-surface flex flex-col gap-2 rounded-md border p-3"
          >
            <input type="hidden" name="memberId" value={activeMember.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <p className="text-muted-brand text-xs">
              Zgłoś z wyprzedzeniem, żeby trener wiedział o przerwie - alerty o braku treningu
              zostaną wstrzymane na czas zgłoszenia.
            </p>
            <select
              name="reason"
              required
              className="border-line bg-surface-2 text-text w-40 rounded-md border px-2 py-1 text-sm"
            >
              <option value="INJURY">Kontuzja</option>
              <option value="OTHER">Inny powód</option>
            </select>
            <Textarea
              name="note"
              placeholder="Komentarz (opcjonalnie)"
              className="border-line bg-surface-2"
            />
            <Button type="submit" size="sm" variant="outline" className="self-start">
              Zgłoś nieobecność
            </Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Grafik · {weekLabel}
          </h2>
          <div className="flex items-center gap-2">
            {canGoBack ? (
              <Link
                href={linkWith({ tydzien: isoDate(prevWeekStart) })}
                className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
              >
                ← Poprzedni
              </Link>
            ) : (
              <span className="border-line bg-surface-2 text-muted-brand rounded-md border px-3 py-1.5 font-mono text-xs uppercase opacity-50">
                ← Poprzedni
              </span>
            )}
            <Link
              href={linkWith({ tydzien: isoDate(nextWeekStart) })}
              className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
            >
              Następny →
            </Link>
          </div>
        </div>

        {plannerSessions.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
            W tym tygodniu nie ma zajęć spełniających wybrane filtry.
          </p>
        ) : (
          <WeekPlanner
            weekStart={weekStart}
            sessions={plannerSessions}
            memberId={activeMember.id}
            now={now}
            horizonEnd={horizonEnd}
            returnTo={returnTo}
          />
        )}

        <div className="text-muted-brand flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="border-brand-red/60 bg-brand-red/10 inline-block size-3 rounded border" />
            Można się zapisać
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-jade/60 bg-jade/10 inline-block size-3 rounded border" />
            Jesteś zapisany
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-line bg-surface-2 inline-block size-3 rounded border" />
            Komplet albo poza oknem zapisów
          </span>
        </div>

        <p className="text-muted-brand text-xs">
          Zapisy są otwarte {describeHorizon(settings.bookingHorizonMode, settings.bookingHorizonDays)}.
          Zajęcia dalej w kalendarzu są widoczne, ale zapiszesz się na nie dopiero, gdy okno się
          przesunie.
        </p>
      </section>
    </div>
  );
}
