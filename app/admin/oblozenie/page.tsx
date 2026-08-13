import { prisma } from "@/lib/prisma";

const DAYS_AHEAD = 14;

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fillColor(ratio: number): string {
  if (ratio >= 1) return "bg-brand-red";
  if (ratio >= 0.7) return "bg-amber";
  return "bg-jade";
}

// Obłożenie sal (SPEC.md sekcja 3, ekran właściciela) - wypełnienie
// nadchodzących zajęć per lokalizacja, żeby widzieć gdzie brakuje miejsc
// (dokupić trenera/grupę) albo gdzie sale świecą pustkami.
export default async function RoomOccupancyPage() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);

  const [locations, sessions] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.session.findMany({
      where: { status: "SCHEDULED", startsAt: { gte: now, lt: windowEnd } },
      include: { bookings: { where: { status: "BOOKED" } }, trainer: { include: { user: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const totalCapacity = sessions.reduce((sum, s) => sum + s.capacity, 0);
  const totalBooked = sessions.reduce((sum, s) => sum + s.bookings.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Obłożenie sal</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Najbliższe {DAYS_AHEAD} dni · średnie wypełnienie{" "}
          {totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0}% ({totalBooked}/
          {totalCapacity} miejsc)
        </p>
      </div>

      {locations.map((loc) => {
        const locSessions = sessions.filter((s) => s.locationId === loc.id);
        return (
          <section key={loc.id}>
            <h2 className="font-display text-brand-red text-lg tracking-wide">{loc.name}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {locSessions.map((s) => {
                const bookedCount = s.bookings.length;
                const ratio = s.capacity > 0 ? bookedCount / s.capacity : 0;
                return (
                  <li key={s.id} className="border-line bg-surface rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-text font-medium">{s.name}</p>
                        <p className="text-muted-brand font-mono text-xs">
                          {formatDay(s.startsAt)} · {formatTime(s.startsAt)} · {s.trainer.user.name}
                        </p>
                      </div>
                      <span className="font-mono text-sm">
                        {bookedCount}/{s.capacity}
                      </span>
                    </div>
                    <div className="bg-surface-2 mt-2 h-2 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full ${fillColor(ratio)}`}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
              {locSessions.length === 0 ? (
                <li className="text-muted-brand text-sm">Brak zaplanowanych zajęć.</li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
