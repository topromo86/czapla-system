import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { buildSlots, MIN_BOOKING_LEAD_HOURS } from "@/lib/domain/availability";
import { canCancelFree, FREE_CANCELLATION_WINDOW_HOURS } from "@/lib/domain/booking";
import { formatDate, formatTime } from "@/lib/format";
import { bookIndividualSlotAction, cancelIndividualSlotAction } from "./actions";

const dayHeadingFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function IndividualTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; trener?: string; klient?: string }>;
}) {
  const { error, trener, klient } = await searchParams;
  const members = await getAccessibleMembers();

  if (members.length === 0) {
    return (
      <p className="text-muted-brand">
        To konto nie ma jeszcze przypisanego profilu klienta. Skontaktuj się z klubem.
      </p>
    );
  }

  const activeMember = members.find((m) => m.id === klient) ?? members[0];
  const now = new Date();

  const trainersWithWindows = await prisma.trainer.findMany({
    where: { active: true, availabilityWindows: { some: { active: true } } },
    include: { user: true, location: true },
    orderBy: { user: { name: "asc" } },
  });

  const selectedTrainer =
    trainersWithWindows.find((t) => t.id === trener) ?? trainersWithWindows[0] ?? null;

  const [windows, busy, myBookings] = await Promise.all([
    selectedTrainer
      ? prisma.availabilityWindow.findMany({
          where: { trainerId: selectedTrainer.id, active: true },
        })
      : Promise.resolve([]),
    selectedTrainer
      ? prisma.session.findMany({
          where: {
            trainerId: selectedTrainer.id,
            kind: "INDIVIDUAL",
            status: { not: "CANCELLED" },
            startsAt: { gte: now },
          },
          select: { startsAt: true },
        })
      : Promise.resolve([]),
    prisma.booking.findMany({
      where: {
        memberId: activeMember.id,
        status: "BOOKED",
        session: { kind: "INDIVIDUAL", startsAt: { gte: now }, status: { not: "CANCELLED" } },
      },
      include: { session: { include: { trainer: { include: { user: true } }, location: true } } },
      orderBy: { session: { startsAt: "asc" } },
    }),
  ]);

  const slots = buildSlots({
    windows,
    busyStarts: busy.map((s) => s.startsAt),
    now,
  });

  const slotsByDay = new Map<string, typeof slots>();
  for (const slot of slots) {
    const key = dayKey(slot.startsAt);
    const bucket = slotsByDay.get(key);
    if (bucket) bucket.push(slot);
    else slotsByDay.set(key, [slot]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Trening indywidualny</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Wybierz trenera i wolny termin. Widoczne są tylko godziny, w których trener przyjmuje.
        </p>
      </div>

      {error ? (
        <p role="alert" className="border-red/40 bg-red/5 text-red rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}

      {members.length > 1 ? (
        <section>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Dla kogo</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {members.map((member) => (
              <a
                key={member.id}
                href={`/app/indywidualne?klient=${member.id}${trener ? `&trener=${trener}` : ""}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  member.id === activeMember.id
                    ? "border-brand-red text-brand-red font-medium"
                    : "border-line bg-surface text-text"
                }`}
              >
                {member.firstName} {member.lastName}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {myBookings.length > 0 ? (
        <section>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Twoje umówione treningi
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {myBookings.map((booking) => {
              const free = canCancelFree(booking.session.startsAt, now);
              return (
                <li
                  key={booking.id}
                  className="border-jade/40 bg-jade/5 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="text-text font-medium">
                      {formatDate(booking.session.startsAt)}, {formatTime(booking.session.startsAt)}
                    </p>
                    <p className="text-muted-brand mt-1 font-mono text-xs">
                      {booking.session.trainer.user.name} · {booking.session.location.name}
                    </p>
                  </div>
                  <form action={cancelIndividualSlotAction} className="flex items-center gap-2">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <span className="text-muted-brand text-xs">
                      {free ? "Odwołanie bezpłatne" : "Wejście przepadnie"}
                    </span>
                    <Button type="submit" size="sm" variant="outline">
                      Odwołaj
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {trainersWithWindows.length === 0 ? (
        <p className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
          Żaden trener nie ma jeszcze ustawionych godzin na treningi indywidualne. Zapytaj w klubie.
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Trener</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {trainersWithWindows.map((trainer) => (
                <a
                  key={trainer.id}
                  href={`/app/indywidualne?trener=${trainer.id}&klient=${activeMember.id}`}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    trainer.id === selectedTrainer?.id
                      ? "border-brand-red text-brand-red font-medium"
                      : "border-line bg-surface text-text"
                  }`}
                >
                  {trainer.user.name}
                  <span className="text-muted-brand ml-1 font-mono text-xs">
                    {trainer.location.name}
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Wolne terminy ({slots.length})
            </h2>

            {slots.length === 0 ? (
              <p className="text-muted-brand border-line bg-surface mt-2 rounded-md border p-4 text-sm">
                Brak wolnych terminów u tego trenera w najbliższych dniach. Sprawdź innego trenera
                albo zajrzyj później.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-4">
                {[...slotsByDay.entries()].map(([key, daySlots]) => (
                  <div key={key}>
                    <p className="text-text font-mono text-xs tracking-widest uppercase">
                      {dayHeadingFormatter.format(daySlots[0].startsAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {daySlots.map((slot) => (
                        <form
                          key={slot.startsAt.toISOString()}
                          action={bookIndividualSlotAction}
                          className="contents"
                        >
                          <input type="hidden" name="memberId" value={activeMember.id} />
                          <input type="hidden" name="trainerId" value={slot.trainerId} />
                          <input
                            type="hidden"
                            name="startsAt"
                            value={slot.startsAt.toISOString()}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            {formatTime(slot.startsAt)}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-muted-brand mt-4 text-xs">
              Terminy znikają z listy, gdy ktoś je zajmie oraz gdy do startu zostało mniej niż{" "}
              {MIN_BOOKING_LEAD_HOURS} godz. Odwołanie na mniej niż {FREE_CANCELLATION_WINDOW_HOURS}{" "}
              godz. przed treningiem kosztuje wejście z karnetu - tak samo jak przy zajęciach
              grupowych.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
