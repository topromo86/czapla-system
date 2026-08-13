import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import {
  buildSlots,
  findSlotInOtherRoom,
  isSlotFree,
  MIN_BOOKING_LEAD_HOURS,
  sharedRoomNotice,
  SLOT_BLOCK_MESSAGE,
} from "@/lib/domain/availability";
import { canCancelFree } from "@/lib/domain/booking";
import { loadClubAvailability } from "@/lib/services/availability";
import { getClubSettings } from "@/lib/services/settings";
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

  const [settings, availability, locations, myBookings] = await Promise.all([
    getClubSettings(),
    loadClubAvailability(now),
    prisma.location.findMany({ select: { id: true, name: true } }),
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

  // Sloty całego klubu, nie tylko wybranego trenera: bez tego nie da się ani
  // sprawdzić, czy sala jest wolna, ani podpowiedzieć drugiej lokalizacji.
  // forMinor: reguła "nie łączymy dziecka z obcym dorosłym" zależy od tego,
  // KTO się zapisuje - liczymy sloty dla wybranej kartoteki.
  const allSlots = buildSlots({
    windows: availability.windows,
    busy: availability.busy,
    now,
    forMinor: activeMember.isMinor,
  });

  const trainerSlots = allSlots.filter(
    (slot) =>
      slot.trainerId === selectedTrainer?.id &&
      // Terminy zajęte przez samego trenera znikają jak dotąd - to nie jest
      // wybór klienta, tylko fakt. Pokazujemy natomiast te, które blokuje
      // zajęta sala, bo tam podpowiedź "wolne w drugiej sali" ma sens.
      slot.blockedBy !== "TRAINER_BUSY",
  );
  const freeCount = trainerSlots.filter(isSlotFree).length;

  const locationNames = new Map(locations.map((l) => [l.id, l.name] as const));
  const trainerNames = new Map(
    trainersWithWindows.map((t) => [t.id, t.user.name ?? "trener"] as const),
  );

  // Trener bywa dostępny w obu salach. Wtedy przy każdej godzinie musi być
  // napisane, dokąd klient ma przyjść - przy jednej sali to zbędny szum.
  const showRoomOnSlot = new Set(trainerSlots.map((s) => s.locationId)).size > 1;

  const slotsByDay = new Map<string, typeof trainerSlots>();
  for (const slot of trainerSlots) {
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
              const free = canCancelFree(
                booking.session.startsAt,
                now,
                settings.freeCancellationHours,
              );
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
              Wolne terminy ({freeCount})
            </h2>

            {trainerSlots.length === 0 ? (
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
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      {daySlots.map((slot) => {
                        // Klucz z salą, nie samą godziną: ten sam trener może
                        // mieć o 17:00 okno w obu salach.
                        const key = `${slot.locationId}-${slot.startsAt.toISOString()}`;

                        if (isSlotFree(slot)) {
                          return (
                            <form
                              key={key}
                              action={bookIndividualSlotAction}
                              className="flex flex-col items-start gap-1"
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
                              {showRoomOnSlot ? (
                                <span className="text-muted-brand text-[11px] leading-tight">
                                  {locationNames.get(slot.locationId)}
                                </span>
                              ) : null}
                              {/* Ktoś inny ma wtedy personalny w tej sali.
                                  To nie przeszkoda - klient ma o tym wiedzieć
                                  przed zapisem i sam zdecydować. */}
                              {slot.sharedWith > 0 ? (
                                <span
                                  className="text-amber max-w-32 text-[11px] leading-tight"
                                  title={sharedRoomNotice(slot) ?? undefined}
                                >
                                  + ktoś jeszcze trenuje
                                </span>
                              ) : null}
                            </form>
                          );
                        }

                        // Sala zajęta. Godzina zostaje widoczna, ale wyłączona -
                        // i od razu mówi, gdzie o tej samej porze jest wolne
                        // miejsce, żeby klient nie szukał po trenerach na ślepo.
                        const elsewhere = findSlotInOtherRoom(allSlots, slot);
                        return (
                          <div key={key} className="flex flex-col items-start gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled
                              title={
                                slot.blockedBy ? SLOT_BLOCK_MESSAGE[slot.blockedBy] : undefined
                              }
                            >
                              {formatTime(slot.startsAt)}
                            </Button>
                            <span className="text-muted-brand max-w-32 text-[11px] leading-tight">
                              {elsewhere ? (
                                <a
                                  href={`/app/indywidualne?trener=${elsewhere.trainerId}&klient=${activeMember.id}`}
                                  className="hover:text-brand-red underline underline-offset-2"
                                >
                                  wolne w: {locationNames.get(elsewhere.locationId)} (
                                  {trainerNames.get(elsewhere.trainerId)})
                                </a>
                              ) : slot.blockedBy === "AGE_MIX" ? (
                                "inna grupa wiekowa"
                              ) : (
                                "sala zajęta"
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-muted-brand mt-4 text-xs">
              Przy niektórych godzinach zobaczysz „+ ktoś jeszcze trenuje” - to znaczy, że w tej
              sali trwa wtedy drugi trening indywidualny. Możesz się zapisać, jeśli Ci to nie
              przeszkadza. Nieaktywne są tylko godziny z zajęciami grupowymi w sali oraz te, w
              których ćwiczyłaby obok osoba z innej grupy wiekowej - dorosłych i nieletnich nie
              łączymy na jednej macie. Terminy znikają z listy, gdy do startu zostało mniej niż{" "}
              {MIN_BOOKING_LEAD_HOURS} godz. Odwołanie na mniej niż {settings.freeCancellationHours}{" "}
              godz. przed treningiem kosztuje wejście z karnetu - tak samo jak przy zajęciach
              grupowych.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
