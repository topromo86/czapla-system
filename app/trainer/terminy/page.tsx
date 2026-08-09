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
} from "@/lib/domain/availability";
import { loadClubAvailability } from "@/lib/services/availability";
import { formatTime } from "@/lib/format";
import { createMyAvailabilityWindowAction, deleteMyAvailabilityWindowAction } from "./actions";

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
const BLOCK_LABEL = {
  TRAINER_BUSY: "masz wtedy zajęcia",
  ROOM_BUSY: "sala zajęta",
} as const;

export default async function TrainerSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { trainer } = await requireTrainerSelf();
  const now = new Date();

  const [myWindows, locations, availability] = await Promise.all([
    prisma.availabilityWindow.findMany({
      where: { trainerId: trainer.id, active: true },
      include: { location: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    loadClubAvailability(now),
  ]);

  const locationNames = new Map(locations.map((l) => [l.id, l.name] as const));

  const mySlots = buildSlots({
    windows: availability.windows,
    busy: availability.busy,
    now,
  }).filter((slot) => slot.trainerId === trainer.id);
  const freeCount = mySlots.filter(isSlotFree).length;

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
