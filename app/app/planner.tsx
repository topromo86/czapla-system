import { Button } from "@/components/ui/button";
import {
  collapseEmptyHours,
  gridCellKey,
  hourRange,
  hoursInRange,
  sessionBookableStatus,
  weekDays,
  type BookableStatus,
} from "@/lib/domain/schedule";
import type { CalendarDate } from "@/lib/domain/time";
import { formatTime } from "@/lib/format";
import {
  cellHeightClass,
  CollapsedGap,
  dayKeyOf,
  GRID_COLUMNS,
  HourLabelCell,
  localDayKey,
  localHour,
} from "@/app/week-grid-parts";
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
  // Klasa paska z kolorem rodzaju - wyliczana na stronie dla całej listy
  // rodzajów naraz (lib/domain/class-color.ts), więc kolory się nie powtarzają.
  stripe: string;
};

// Godzina w czasie klubu - kafelek ma trafić do pasa, który klient widzi na
// swoim zegarze, a nie w UTC serwera.
export const // Wygląd kafelka zależy od stanu terminu. Podświetlone (czerwona ramka +
  // wypełnienie) są wyłącznie te, na które da się zapisać - to jest sedno
  // prośby: "tam gdzie są zajęcia do zapisania mają być podświetlone".
  TILE_STYLE: Record<BookableStatus, string> = {
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
  const busyHours = new Set<number>();
  for (const session of sessions) {
    const hour = localHour(session.startsAt);
    busyHours.add(hour);
    const key = `${localDayKey(session.startsAt)}T${String(hour).padStart(2, "0")}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(session);
    else byCell.set(key, [session]);
  }

  // Godziny bez zajęć w całym tygodniu zwijamy - na telefonie klienta puste
  // pasy między porankiem a wieczorem to było kilka ekranów przewijania.
  const rows = collapseEmptyHours(hours, busyHours);

  const todayKey = localDayKey(now);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
        <div className="grid gap-1" style={{ gridTemplateColumns: GRID_COLUMNS }}>
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

          {rows.map((row) =>
            row.kind === "gap" ? (
              <CollapsedGap key={`gap-${row.hours[0]}`} hours={row.hours} days={days} />
            ) : (
              <PlannerRow
                key={row.hour}
                hour={row.hour}
                empty={row.empty}
                days={days}
                byCell={byCell}
                memberId={memberId}
                now={now}
                horizonEnd={horizonEnd}
                returnTo={returnTo}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function PlannerRow({
  hour,
  empty,
  days,
  byCell,
  memberId,
  now,
  horizonEnd,
  returnTo,
}: {
  hour: number;
  empty: boolean;
  days: CalendarDate[];
  byCell: Map<string, PlannerSession[]>;
  memberId: string;
  now: Date;
  horizonEnd: Date;
  returnTo: string;
}) {
  return (
    <>
      <HourLabelCell hour={hour} empty={empty} />
      {days.map((day) => {
        const cellSessions = byCell.get(gridCellKey(day, hour)) ?? [];
        return (
          <div
            key={`${dayKeyOf(day)}-${hour}`}
            className={`border-line-soft flex flex-col gap-1 border-t py-1 ${cellHeightClass(empty)}`}
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
    <div className={`rounded-md border p-1.5 text-left ${TILE_STYLE[status]} ${session.stripe}`}>
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
