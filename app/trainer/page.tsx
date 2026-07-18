import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { addCalendarDays, todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignSubstituteAction, cancelSessionAction, markManualAttendanceAction } from "./actions";

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function TrainerTodayPage() {
  const { trainer } = await requireTrainerSelf();

  const today = todayInTimeZone(new Date());
  const tomorrow = addCalendarDays(today, 1);
  const todayStart = zonedTimeToUtc(today.year, today.month, today.day, 0, 0);
  const todayEnd = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0);

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: todayStart, lt: todayEnd },
      status: "SCHEDULED",
      OR: [{ trainerId: trainer.id }, { substituteTrainerId: trainer.id }],
    },
    include: {
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED"] } },
        include: { member: true },
      },
      attendances: true,
    },
    orderBy: { startsAt: "asc" },
  });

  if (sessions.length === 0) {
    return <p className="text-muted-brand">Brak zajęć dzisiaj.</p>;
  }

  const otherTrainers = await prisma.trainer.findMany({
    where: { locationId: trainer.locationId, active: true, id: { not: trainer.id } },
    include: { user: true },
  });

  return (
    <div className="flex flex-col gap-6">
      {sessions.map((s) => (
        <section key={s.id} className="border-line bg-surface rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-text font-medium">
              {s.name} - {formatTime(s.startsAt)}
            </h2>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {s.bookings.map((b) => {
              const attendance = s.attendances.find((a) => a.memberId === b.memberId);
              return (
                <li key={b.id} className="flex items-center justify-between">
                  <span className="text-text text-sm">
                    {b.member.firstName} {b.member.lastName}
                  </span>
                  {attendance ? (
                    <span className="text-jade font-mono text-xs tracking-widest uppercase">
                      Obecny ({attendance.method === "QR" ? "QR" : "ręcznie"})
                    </span>
                  ) : (
                    <form action={markManualAttendanceAction}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Zaznacz obecność
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
            {s.bookings.length === 0 ? (
              <li className="text-muted-brand text-sm">Brak zapisanych.</li>
            ) : null}
          </ul>

          <div className="border-line-soft mt-4 flex flex-wrap items-center gap-4 border-t pt-3">
            {otherTrainers.length > 0 ? (
              <form action={assignSubstituteAction} className="flex items-center gap-2">
                <input type="hidden" name="sessionId" value={s.id} />
                <select
                  name="substituteTrainerId"
                  required
                  defaultValue={s.substituteTrainerId ?? ""}
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-1 text-sm"
                >
                  <option value="" disabled>
                    Wyznacz zastępstwo...
                  </option>
                  {otherTrainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline" size="sm">
                  Zapisz zastępstwo
                </Button>
              </form>
            ) : null}

            <form action={cancelSessionAction} className="flex items-center gap-2">
              <input type="hidden" name="sessionId" value={s.id} />
              <Input
                name="reason"
                placeholder="Powód odwołania"
                required
                className="border-line bg-surface-2 h-8 w-48 text-sm"
              />
              <Button type="submit" variant="destructive" size="sm">
                Odwołaj zajęcia
              </Button>
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}
