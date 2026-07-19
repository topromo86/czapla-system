import { Button } from "@/components/ui/button";
import {
  gridCellKey,
  hourRange,
  hoursInRange,
  sessionBookableStatus,
  weekDays,
  type BookableStatus,
} from "@/lib/domain/schedule";
import type { CalendarDate } from "@/lib/domain/time";
import { formatTime } from "@/lib/format";
import { bookSessionAction, cancelBookingAction } from "./actions";

const dayNameFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  weekday: "short",
});

export type PlannerSession = {
  id: string;
  name: string;
  startsAt: Date;
  capacity: number;
  status: string;
  categoryName: string | null;
  trainerName: string;
  bookedCount: number;
  myBookingId: string | null;
  myBookingStatus: string | null;
};

// Godzina w czasie klubu - kafelek ma trafić do pasa, który klient widzi na
// swoim zegarze, a nie w UTC serwera.
export function localHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

export function localDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayKeyOf(day: CalendarDate): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

// Wygląd kafelka zależy od stanu terminu. Podświetlone (czerwona ramka +
// wypełnienie) są wyłącznie te, na które da się zapisać - to jest sedno
// prośby: "tam gdzie są zajęcia do zapisania mają być podświetlone".
const TILE_STYLE: Record<BookableStatus, string> = {
  BOOKABLE: "border-brand-red/60 bg-brand-red/10 hover:bg-brand-red/20",
  ALREADY_BOOKED: "border-jade/60 bg-jade/10",
  FULL: "border-line bg-surface-2 opacity-70",
  BEYOND_HORIZON: "border-line bg-surface-2 opacity-50",
  PAST: "border-line bg-surface-2 opacity-40",
  CANCELLED: "border-red/40 bg-red/5 opacity-60",
};

const STATUS_NOTE: Record<BookableStatus, string | null> = {
  BOOKABLE: null,
  ALREADY_BOOKED: "Zapisany",
  FULL: "Komplet",
  BEYOND_HORIZON: "Poza oknem zapisów",
  PAST: "Minęły",
  CANCELLED: "Odwołane",
};

export function WeekPlanner({
  weekStart,
  sessions,
  memberId,
  now,
  horizonEnd,
  returnTo,
}: {
  weekStart: CalendarDate;
  sessions: PlannerSession[];
  memberId: string;
  now: Date;
  horizonEnd: Date;
  returnTo: string;
}) {
  const days = weekDays(weekStart);
  const range = hourRange(sessions.map((s) => localHour(s.startsAt)));
  const hours = hoursInRange(range);

  const byCell = new Map<string, PlannerSession[]>();
  for (const session of sessions) {
    const key = `${localDayKey(session.startsAt)}T${String(localHour(session.startsAt)).padStart(2, "0")}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(session);
    else byCell.set(key, [session]);
  }

  const todayKey = localDayKey(now);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
        >
          <div />
          {days.map((day) => {
            const key = dayKeyOf(day);
            const isToday = key === todayKey;
            const date = new Date(Date.UTC(day.year, day.month - 1, day.day, 12));
            return (
              <div
                key={key}
                className={`rounded-md p-2 text-center font-mono text-xs tracking-widest uppercase ${
                  isToday ? "bg-brand-red/10 text-brand-red font-bold" : "text-muted-brand"
                }`}
              >
                <div>{dayNameFormatter.format(date)}</div>
                <div className="mt-0.5 text-sm">{day.day}</div>
              </div>
            );
          })}

          {hours.map((hour) => (
            <PlannerRow
              key={hour}
              hour={hour}
              days={days}
              byCell={byCell}
              memberId={memberId}
              now={now}
              horizonEnd={horizonEnd}
              returnTo={returnTo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlannerRow({
  hour,
  days,
  byCell,
  memberId,
  now,
  horizonEnd,
  returnTo,
}: {
  hour: number;
  days: CalendarDate[];
  byCell: Map<string, PlannerSession[]>;
  memberId: string;
  now: Date;
  horizonEnd: Date;
  returnTo: string;
}) {
  return (
    <>
      <div className="text-muted-brand border-line-soft border-t py-2 text-right font-mono text-xs">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((day) => {
        const cellSessions = byCell.get(gridCellKey(day, hour)) ?? [];
        return (
          <div
            key={`${dayKeyOf(day)}-${hour}`}
            className="border-line-soft flex min-h-14 flex-col gap-1 border-t py-1"
          >
            {cellSessions.map((session) => (
              <SessionTile
                key={session.id}
                session={session}
                memberId={memberId}
                now={now}
                horizonEnd={horizonEnd}
                returnTo={returnTo}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function SessionTile({
  session,
  memberId,
  now,
  horizonEnd,
  returnTo,
}: {
  session: PlannerSession;
  memberId: string;
  now: Date;
  horizonEnd: Date;
  returnTo: string;
}) {
  const status = sessionBookableStatus({
    session: { startsAt: session.startsAt, status: session.status, capacity: session.capacity },
    bookedCount: session.bookedCount,
    memberAlreadyBooked: session.myBookingId != null,
    now,
    horizonEnd,
  });

  const note = STATUS_NOTE[status];

  return (
    <div className={`rounded-md border p-1.5 text-left ${TILE_STYLE[status]}`}>
      <p className="text-text truncate text-xs leading-tight font-medium" title={session.name}>
        {session.name}
      </p>
      <p className="text-muted-brand mt-0.5 font-mono text-[10px] leading-tight">
        {formatTime(session.startsAt)} · {session.bookedCount}/{session.capacity}
      </p>
      {session.categoryName ? (
        <p className="text-muted-brand truncate font-mono text-[10px] leading-tight">
          {session.categoryName}
        </p>
      ) : null}

      {status === "BOOKABLE" ? (
        <form action={bookSessionAction} className="mt-1">
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button type="submit" size="sm" className="h-6 w-full px-1 text-[10px]">
            Zapisz się
          </Button>
        </form>
      ) : null}

      {status === "ALREADY_BOOKED" && session.myBookingId ? (
        <form action={cancelBookingAction} className="mt-1">
          <input type="hidden" name="bookingId" value={session.myBookingId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button type="submit" size="sm" variant="outline" className="h-6 w-full px-1 text-[10px]">
            {session.myBookingStatus === "WAITLIST" ? "Rezerwowa - odwołaj" : "Odwołaj"}
          </Button>
        </form>
      ) : null}

      {note && status !== "ALREADY_BOOKED" ? (
        <p className="text-muted-brand mt-1 font-mono text-[10px] leading-tight">{note}</p>
      ) : null}
    </div>
  );
}
