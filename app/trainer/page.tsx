import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { addCalendarDays, todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { seesSessionWhere } from "@/lib/domain/substitute";
import { formatDayTime } from "@/lib/format";
import {
  assignSubstituteAction,
  cancelSessionAction,
  markManualAttendanceAction,
  respondToSubstituteAction,
} from "./actions";

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

  const [sessions, pendingForMe, otherTrainers] = await Promise.all([
    prisma.session.findMany({
      where: {
        startsAt: { gte: todayStart, lt: todayEnd },
        status: "SCHEDULED",
        ...seesSessionWhere(trainer.id),
      },
      include: {
        bookings: {
          where: { status: { in: ["BOOKED", "ATTENDED"] } },
          include: { member: true },
        },
        attendances: true,
        trainer: { include: { user: true } },
        substituteTrainer: { include: { user: true } },
      },
      orderBy: { startsAt: "asc" },
    }),

    // Prośby o zastępstwo z całej przyszłości, nie tylko z dzisiaj - inaczej
    // prośba na przyszły tydzień byłaby niewidoczna aż do dnia zajęć.
    prisma.session.findMany({
      where: {
        substituteTrainerId: trainer.id,
        substituteStatus: "PENDING",
        status: "SCHEDULED",
        startsAt: { gte: new Date() },
      },
      include: {
        location: true,
        trainer: { include: { user: true } },
      },
      orderBy: { startsAt: "asc" },
    }),

    prisma.trainer.findMany({
      where: { locationId: trainer.locationId, active: true, id: { not: trainer.id } },
      include: { user: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {pendingForMe.length > 0 ? (
        <section className="border-amber bg-surface rounded-md border-2 p-4">
          <h2 className="text-amber font-mono text-xs tracking-widest uppercase">
            Zastępstwa do potwierdzenia ({pendingForMe.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {pendingForMe.map((s) => (
              <li key={s.id} className="border-line bg-surface-2 rounded-md border p-3">
                <p className="text-text font-medium">{s.name}</p>
                <p className="text-muted-brand mt-0.5 font-mono text-xs">
                  {formatDayTime(s.startsAt)} · {s.location.name}
                </p>
                <p className="text-muted-brand mt-1 text-sm">
                  {s.substituteByAdmin ? (
                    <>
                      Wyznaczone przez właściciela. Zajęcia prowadzi{" "}
                      <b className="text-text">{s.trainer.user.name}</b> - potwierdź, że przyjmujesz
                      zastępstwo do wiadomości.
                    </>
                  ) : (
                    <>
                      <b className="text-text">{s.trainer.user.name}</b> prosi Cię o zastępstwo.
                      Możesz potwierdzić albo odmówić.
                    </>
                  )}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={respondToSubstituteAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <input type="hidden" name="decision" value="ACCEPT" />
                    <Button type="submit" size="sm">
                      {s.substituteByAdmin ? "Przyjmuję do wiadomości" : "Potwierdzam"}
                    </Button>
                  </form>

                  {/* Odmowa tylko przy prośbie od trenera - polecenia
                      właściciela się nie odrzuca (lib/domain/substitute.ts). */}
                  {!s.substituteByAdmin ? (
                    <form action={respondToSubstituteAction} className="flex items-center gap-2">
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input type="hidden" name="decision" value="DECLINE" />
                      <Input name="reason" placeholder="Powód odmowy (opcjonalnie)" className="w-56" />
                      <Button type="submit" variant="outline" size="sm">
                        Nie mogę
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-brand mt-3 text-xs">
            Dopóki nie potwierdzisz, zajęcia prowadzi trener pierwotny - nikt nie zostaje bez opieki.
          </p>
        </section>
      ) : null}

      {sessions.length === 0 ? <p className="text-muted-brand">Brak zajęć dzisiaj.</p> : null}

      {sessions.map((s) => (
        <section key={s.id} className="border-line bg-surface rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-text font-medium">
              {s.name} - {formatTime(s.startsAt)}
            </h2>
            {s.substituteStatus && s.substituteTrainer ? (
              <span
                className={`font-mono text-xs tracking-widest uppercase ${
                  s.substituteStatus === "ACCEPTED"
                    ? "text-jade"
                    : s.substituteStatus === "DECLINED"
                      ? "text-red"
                      : "text-amber"
                }`}
              >
                {s.substituteStatus === "ACCEPTED"
                  ? `Prowadzi ${s.substituteTrainer.user.name}`
                  : s.substituteStatus === "DECLINED"
                    ? `${s.substituteTrainer.user.name} odmówił(a)`
                    : `Czeka na ${s.substituteTrainer.user.name}`}
              </span>
            ) : null}
          </div>

          {/* Odmowa musi być widoczna dla trenera pierwotnego - to on wraca
              do prowadzenia i musi wiedzieć dlaczego. */}
          {s.substituteStatus === "DECLINED" && s.trainerId === trainer.id ? (
            <p className="border-red bg-surface-2 text-text mt-2 rounded-md border p-2 text-sm">
              {s.substituteTrainer?.user.name} nie może poprowadzić tych zajęć
              {s.substituteDeclineReason ? `: ${s.substituteDeclineReason}.` : "."} Zajęcia wracają
              do Ciebie - wyznacz kogoś innego albo poprowadź je sam(a).
            </p>
          ) : null}

          {/* Zastępca przed potwierdzeniem widzi zajęcia, ale nie odhacza
              jeszcze obecności - odpowiada za nie trener pierwotny. */}
          {s.substituteStatus === "PENDING" && s.substituteTrainerId === trainer.id ? (
            <p className="border-amber bg-surface-2 text-muted-brand mt-2 rounded-md border p-2 text-sm">
              Potwierdź zastępstwo powyżej, żeby móc prowadzić listę obecności.
            </p>
          ) : null}

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
            {/* Zastępstwo wyznacza wyłącznie trener pierwotny. Zastępca, nawet
                po potwierdzeniu, nie przekazuje zajęć dalej. */}
            {otherTrainers.length > 0 && s.trainerId === trainer.id ? (
              <form action={assignSubstituteAction} className="flex items-center gap-2">
                <input type="hidden" name="sessionId" value={s.id} />
                <select
                  name="substituteTrainerId"
                  defaultValue={s.substituteTrainerId ?? ""}
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-1 text-sm"
                >
                  {/* Pusta wartość wycofuje zastępstwo - bez niej nie dałoby
                      się odwołać własnej prośby. */}
                  <option value="">Bez zastępstwa</option>
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
