import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { startOfWeek, weekDays } from "@/lib/domain/schedule";
import { addCalendarDays, todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";
import { assignCategoryColors, stripeClass } from "@/lib/domain/class-color";
import { AdminWeekGrid, type GridSession } from "./week-grid";

function isoDate(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export default async function AdminWeekViewPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; tydzien?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const now = new Date();
  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });
  const activeLocationId =
    locations.find((l) => l.id === params.location)?.id ?? locations[0]?.id ?? null;

  // Który tydzień. Domyślnie bieżący; admin może cofać się i iść w przód bez
  // ograniczeń - podgląd grafiku wstecz bywa potrzebny do sprawdzenia, co było.
  const currentWeekStart = startOfWeek(todayInTimeZone(now));
  const requested = params.tydzien?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const weekStart = requested
    ? startOfWeek({
        year: Number(requested[1]),
        month: Number(requested[2]),
        day: Number(requested[3]),
      })
    : currentWeekStart;

  const weekStartUtc = zonedTimeToUtc(weekStart.year, weekStart.month, weekStart.day, 0, 0);
  const nextWeekStart = addCalendarDays(weekStart, 7);
  const prevWeekStart = addCalendarDays(weekStart, -7);
  const weekEndUtc = zonedTimeToUtc(
    nextWeekStart.year,
    nextWeekStart.month,
    nextWeekStart.day,
    0,
    0,
  );

  const sessions = activeLocationId
    ? await prisma.session.findMany({
        where: {
          locationId: activeLocationId,
          kind: "GROUP",
          startsAt: { gte: weekStartUtc, lt: weekEndUtc },
        },
        include: {
          category: true,
          trainer: { include: { user: true } },
          bookings: { where: { status: "BOOKED" } },
        },
        orderBy: { startsAt: "asc" },
      })
    : [];

  // Kolory rodzajów liczone dla PEŁNEJ listy kategorii (nie tylko tych obecnych
  // w tym tygodniu) - inaczej ten sam rodzaj miałby inny kolor w różnych
  // tygodniach, zależnie od tego, co akurat jest w grafiku.
  const categories = await prisma.classCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const categoryColors = assignCategoryColors(categories);

  const gridSessions: GridSession[] = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    startsAt: s.startsAt,
    capacity: s.capacity,
    bookedCount: s.bookings.length,
    status: s.status,
    categoryName: s.category?.name ?? null,
    trainerName: s.trainer.user.name,
    stripe: stripeClass(s.categoryId ? categoryColors.get(s.categoryId) : null),
  }));

  const visibleDays = weekDays(weekStart);
  const weekLabel = `${visibleDays[0].day}.${String(visibleDays[0].month).padStart(2, "0")} - ${visibleDays[6].day}.${String(visibleDays[6].month).padStart(2, "0")}`;

  function linkWith(overrides: Record<string, string>): string {
    const query = new URLSearchParams();
    if (activeLocationId) query.set("location", activeLocationId);
    query.set("tydzien", isoDate(weekStart));
    for (const [key, value] of Object.entries(overrides)) query.set(key, value);
    return `/admin/zajecia/tydzien?${query.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-brand-red text-2xl tracking-wide">Grafik tygodniowy</h1>
          <p className="text-muted-brand mt-1 text-sm">
            Tak grafik widzą zapisujący się klienci - podgląd zajęć grupowych w układzie tygodnia.
          </p>
        </div>
        <a
          href="/admin/zajecia"
          className="border-line bg-surface text-text hover:text-brand-red shrink-0 rounded-md border px-3 py-2 font-mono text-xs tracking-widest uppercase"
        >
          ← Zarządzaj zajęciami
        </a>
      </div>

      {locations.length > 1 ? (
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
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Tydzień · {weekLabel}
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href={linkWith({ tydzien: isoDate(prevWeekStart) })}
              className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
            >
              ← Poprzedni
            </Link>
            {isoDate(weekStart) !== isoDate(currentWeekStart) ? (
              <Link
                href={linkWith({ tydzien: isoDate(currentWeekStart) })}
                className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
              >
                Dziś
              </Link>
            ) : null}
            <Link
              href={linkWith({ tydzien: isoDate(nextWeekStart) })}
              className="border-line bg-surface text-text hover:text-brand-red rounded-md border px-3 py-1.5 font-mono text-xs uppercase"
            >
              Następny →
            </Link>
          </div>
        </div>

        {gridSessions.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
            W tym tygodniu nie ma zajęć grupowych w tej lokalizacji.
          </p>
        ) : (
          <AdminWeekGrid
            weekStart={weekStart}
            sessions={gridSessions}
            now={now}
            returnTo={linkWith({})}
          />
        )}

        <div className="text-muted-brand flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="border-line bg-surface inline-block size-3 rounded border" />
            Wolne miejsca
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-amber/50 bg-amber/10 inline-block size-3 rounded border" />
            Komplet
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-red/40 bg-red/5 inline-block size-3 rounded border" />
            Odwołane
          </span>
        </div>
      </section>
    </div>
  );
}
