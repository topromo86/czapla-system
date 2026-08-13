import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildSlots,
  isSlotFree,
  SLOT_MINUTES_OPTIONS,
  WEEKDAY_LABELS,
  type Slot,
  type SlotBlockReason,
} from "@/lib/domain/availability";
import { loadClubAvailability } from "@/lib/services/availability";
import { formatTime } from "@/lib/format";
import {
  bookForMemberAction,
  createMyAvailabilityWindowAction,
  deleteMyAvailabilityWindowAction,
} from "./actions";

const selectClass = "border-line bg-surface-2 text-text mt-1 w-full rounded-md border px-3 py-2";

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

// Trener widzi wprost, czemu dana godzina nie jest do wzięcia. Bez tego okno
// 16:00-20:00 nachodzące na grupowe zajęcia wyglądałoby na zepsute.
const BLOCK_LABEL: Record<SlotBlockReason, string> = {
  TRAINER_BUSY: "masz wtedy zajęcia",
  GROUP_IN_ROOM: "w sali są zajęcia grupowe",
  AGE_MIX: "inna grupa wiekowa na sali",
};

export default async function TrainerSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { trainer } = await requireTrainerSelf();
  const now = new Date();

  const [myWindows, locations, availability, myMembers, upcoming] = await Promise.all([
    prisma.availabilityWindow.findMany({
      where: { trainerId: trainer.id, active: true },
      include: { location: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    loadClubAvailability(now),
    prisma.member.findMany({
      where: { ownerTrainerId: trainer.id },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    // Już umówione treningi indywidualne trenera - żeby widział, komu co
    // obiecał, bez zaglądania do grafiku.
    prisma.session.findMany({
      where: {
        trainerId: trainer.id,
        kind: "INDIVIDUAL",
        status: { not: "CANCELLED" },
        endsAt: { gt: now },
      },
      include: {
        location: true,
        bookings: {
          where: { status: { not: "CANCELLED" } },
          include: { member: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const locationNames = new Map(locations.map((l) => [l.id, l.name] as const));

  const mySlots = buildSlots({
    windows: availability.windows,
    busy: availability.busy,
    now,
  }).filter((slot) => slot.trainerId === trainer.id);
  const freeSlots = mySlots.filter(isSlotFree);
  const freeCount = freeSlots.length;

  const slotsByDay = new Map<string, Slot[]>();
  for (const slot of mySlots) {
    const key = dayKey(slot.startsAt);
    const bucket = slotsByDay.get(key);
    if (bucket) bucket.push(slot);
    else slotsByDay.set(key, [slot]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">
          Moje terminy indywidualne
        </h1>
        <p className="text-muted-brand mt-1 text-sm">
          Ustal, w jakich godzinach i w której sali przyjmujesz na treningi jeden na jeden. Klient
          wybiera termin wyłącznie z tych okien.
        </p>
      </div>

      {error ? (
        <p role="alert" className="border-red/40 bg-red/5 text-red rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="border-jade bg-surface text-text rounded-md border p-3 text-sm">
          Klient zapisany na trening.
        </p>
      ) : null}

      {/* Zapis w imieniu klienta jest pierwszy, bo to jedyna rzecz na tym
          ekranie robiona w biegu - ktoś dzwoni i umawia się na konkretną
          godzinę. Okna ustawia się raz na jakiś czas. */}
      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Umów klienta na trening
        </h2>
        <p className="text-muted-brand mt-1 text-sm">
          Dla klienta, który dogadał termin telefonicznie albo na sali. Obowiązują te same zasady co
          przy zapisie z aplikacji: aktywny karnet, zgody i wolna sala.
        </p>

        {myMembers.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface mt-2 rounded-md border p-4 text-sm">
            Nie masz przypisanych podopiecznych, więc nie ma kogo zapisać.
          </p>
        ) : freeSlots.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface mt-2 rounded-md border p-4 text-sm">
            Nie masz teraz wolnego terminu. Dodaj okno dostępności niżej.
          </p>
        ) : (
          <form
            action={bookForMemberAction}
            className="border-line bg-surface mt-2 grid gap-3 rounded-md border p-4 sm:grid-cols-3"
          >
            <div>
              <Label htmlFor="memberId">Klient</Label>
              <select id="memberId" name="memberId" required className={selectClass}>
                <option value="">Wybierz...</option>
                {myMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.lastName} {member.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="startsAt">Termin</Label>
              <select id="startsAt" name="startsAt" required className={selectClass}>
                {freeSlots.map((slot) => (
                  <option
                    key={`${slot.locationId}-${slot.startsAt.toISOString()}`}
                    value={slot.startsAt.toISOString()}
                  >
                    {dayHeadingFormatter.format(slot.startsAt)}, {formatTime(slot.startsAt)} ·{" "}
                    {locationNames.get(slot.locationId)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit">Umów</Button>
            </div>
          </form>
        )}

        {upcoming.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((individual) => (
              <li
                key={individual.id}
                className="border-jade/40 bg-jade/5 text-text rounded-md border p-3 text-sm"
              >
                {dayHeadingFormatter.format(individual.startsAt)}, {formatTime(individual.startsAt)}
                <span className="text-muted-brand ml-1 font-mono text-xs">
                  · {individual.location.name} ·{" "}
                  {individual.bookings
                    .map((b) => `${b.member.firstName} ${b.member.lastName}`)
                    .join(", ") || "bez zapisanego klienta"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Dodaj okno dostępności
        </h2>

        <form
          action={createMyAvailabilityWindowAction}
          className="border-line bg-surface mt-2 grid gap-3 rounded-md border p-4 sm:grid-cols-5"
        >
          <div>
            <Label htmlFor="locationId">Sala</Label>
            <select
              id="locationId"
              name="locationId"
              required
              defaultValue={trainer.locationId}
              className={selectClass}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="weekday">Dzień</Label>
            <select id="weekday" name="weekday" required defaultValue="1" className={selectClass}>
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="startTime">Od</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              required
              defaultValue="16:00"
              className="border-line bg-surface-2"
            />
          </div>

          <div>
            <Label htmlFor="endTime">Do</Label>
            <Input
              id="endTime"
              name="endTime"
              type="time"
              required
              defaultValue="20:00"
              className="border-line bg-surface-2"
            />
          </div>

          <div>
            <Label htmlFor="slotMinutes">Długość treningu</Label>
            <select
              id="slotMinutes"
              name="slotMinutes"
              required
              defaultValue="60"
              className={selectClass}
            >
              {SLOT_MINUTES_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5">
            <Button type="submit">Dodaj okno</Button>
          </div>
        </form>

        <ul className="mt-3 flex flex-col gap-2">
          {myWindows.map((window) => (
            <li
              key={window.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <p className="text-muted-brand font-mono text-xs">
                {WEEKDAY_LABELS[window.weekday]} · {window.startTime}-{window.endTime} · treningi po{" "}
                {window.slotMinutes} min · {window.location.name}
              </p>
              <form action={deleteMyAvailabilityWindowAction}>
                <input type="hidden" name="windowId" value={window.id} />
                <Button type="submit" size="sm" variant="outline">
                  Usuń
                </Button>
              </form>
            </li>
          ))}
          {myWindows.length === 0 ? (
            <li className="text-muted-brand text-sm">
              Nie masz jeszcze żadnego okna - nikt nie umówi się z Tobą na trening indywidualny.
            </li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Co z tego wychodzi ({freeCount} wolnych terminów)
        </h2>
        <p className="text-muted-brand mt-1 text-sm">
          Tak Twoje okna wyglądają po odjęciu zajęć grupowych i zajętej sali. W jednej sali trwa
          naraz jeden trening indywidualny - jeśli ktoś inny zajmie o tej porze tę salę, godzina
          jest niedostępna także dla Ciebie.
        </p>

        {mySlots.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface mt-2 rounded-md border p-4 text-sm">
            Z Twoich okien nie wychodzi żaden termin w najbliższych dniach.
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
                    // Klucz z salą, nie samą godziną: trener może mieć o 17:00
                    // okno i w Mikołowie, i w Tychach.
                    <span
                      key={`${slot.locationId}-${slot.startsAt.toISOString()}`}
                      className={`rounded-md border px-2 py-1 font-mono text-xs ${
                        isSlotFree(slot)
                          ? "border-jade/40 bg-jade/5 text-jade"
                          : "border-line bg-surface-2 text-muted-brand line-through"
                      }`}
                      title={slot.blockedBy ? BLOCK_LABEL[slot.blockedBy] : "wolny termin"}
                    >
                      {formatTime(slot.startsAt)}
                      <span className="ml-1 no-underline">
                        · {locationNames.get(slot.locationId)}
                        {slot.blockedBy ? ` · ${BLOCK_LABEL[slot.blockedBy]}` : ""}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
