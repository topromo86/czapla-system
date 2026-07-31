import Link from "next/link";
import { gridCellKey, hourRange, hoursInRange, weekDays } from "@/lib/domain/schedule";
import type { CalendarDate } from "@/lib/domain/time";
import { formatTime } from "@/lib/format";
import { DeleteSessionButton } from "./delete-session-button";

const dayNameFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  weekday: "short",
});

export type GridSession = {
  id: string;
  name: string;
  startsAt: Date;
  capacity: number;
  bookedCount: number;
  status: string;
  categoryName: string | null;
  trainerName: string;
};

// Godzina/dzień w czasie klubu - kafelek ma trafić do pasa, który widać na
// zegarze recepcji, nie w UTC serwera. Te same przeliczenia co w plannerze
// klienta, żeby oba widoki układały zajęcia identycznie.
function localHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

function localDayKey(date: Date): string {
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

// Widok tygodniowy dla admina - ten sam układ siatki, który widzą zapisujący się
// klienci. Kafelek pokazuje obłożenie (komplet/odwołane wyróżnione kolorem) i po
// kliknięciu rozwija menu: Otwórz / Edytuj / Usuń. returnTo wraca tu po usunięciu.
export function AdminWeekGrid({
  weekStart,
  sessions,
  now,
  returnTo,
}: {
  weekStart: CalendarDate;
  sessions: GridSession[];
  now: Date;
  returnTo: string;
}) {
  const days = weekDays(weekStart);
  const range = hourRange(sessions.map((s) => localHour(s.startsAt)));
  const hours = hoursInRange(range);

  const byCell = new Map<string, GridSession[]>();
  for (const s of sessions) {
    const key = `${localDayKey(s.startsAt)}T${String(localHour(s.startsAt)).padStart(2, "0")}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(s);
    else byCell.set(key, [s]);
  }

  const todayKey = localDayKey(now);

  return (
    // Na wąskich ekranach siatka przewija się w poziomie; na desktopie (gdzie
    // admin zarządza) overflow wyłączamy, inaczej auto-overflow w pionie
    // przycinałby menu kafelków z dolnego rzędu.
    <div className="overflow-x-auto lg:overflow-x-visible">
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
            <GridRow
              key={hour}
              hour={hour}
              days={days}
              byCell={byCell}
              now={now}
              returnTo={returnTo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GridRow({
  hour,
  days,
  byCell,
  now,
  returnTo,
}: {
  hour: number;
  days: CalendarDate[];
  byCell: Map<string, GridSession[]>;
  now: Date;
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
            {cellSessions.map((s) => (
              <GridTile key={s.id} session={s} now={now} returnTo={returnTo} />
            ))}
          </div>
        );
      })}
    </>
  );
}

// Kafelek to natywne <details> z name="planner-tile" - wspólna nazwa robi z nich
// wyłączny akordeon, więc otwarcie menu jednego kafelka zamyka poprzednie, bez
// cienia JS.
function GridTile({
  session,
  now,
  returnTo,
}: {
  session: GridSession;
  now: Date;
  returnTo: string;
}) {
  const cancelled = session.status === "CANCELLED";
  const past = session.startsAt <= now;
  const full = session.bookedCount >= session.capacity;

  const tone = cancelled
    ? "border-red/40 bg-red/5 opacity-70"
    : past
      ? "border-line bg-surface-2 opacity-50"
      : full
        ? "border-amber/50 bg-amber/10"
        : "border-line bg-surface";

  const tileContent = (
    <>
      <p className="text-text truncate text-xs leading-tight font-medium" title={session.name}>
        {session.name}
      </p>
      <p className="text-muted-brand mt-0.5 font-mono text-[10px] leading-tight">
        {formatTime(session.startsAt)} · {session.bookedCount}/{session.capacity}
      </p>
      <p className="text-muted-brand truncate font-mono text-[10px] leading-tight">
        {session.trainerName}
      </p>
      {cancelled ? (
        <p className="text-red mt-0.5 font-mono text-[10px] leading-tight">Odwołane</p>
      ) : full ? (
        <p className="text-amber mt-0.5 font-mono text-[10px] leading-tight">Komplet</p>
      ) : null}
    </>
  );

  // Zajęcia, które już się odbyły, to historia - sam kafelek, bez menu. Otwieranie
  // czy usuwanie nie ma tu sensu (obecności i wyniki trenerów muszą zostać), a
  // martwe menu tylko myliło: klik „Usuń” przekierowywał w nicość.
  if (past) {
    return <div className={`rounded-md border p-1.5 text-left ${tone}`}>{tileContent}</div>;
  }

  const editHref = `/admin/zajecia?edit=${session.id}`;
  const menuItem =
    "text-text hover:text-brand-red hover:bg-surface-2 block w-full rounded px-2 py-1.5 text-left text-xs";

  return (
    <details name="planner-tile" className="group/tile relative">
      <summary
        className={`list-none rounded-md border p-1.5 text-left ${tone} hover:border-brand-red/60 cursor-pointer [&::-webkit-details-marker]:hidden`}
      >
        {tileContent}
      </summary>

      <div className="border-line bg-surface absolute top-full left-0 z-50 mt-1 flex w-36 flex-col gap-0.5 rounded-md border p-1 shadow-lg">
        <Link href={editHref} className={menuItem}>
          Otwórz
        </Link>
        <Link href={editHref} className={menuItem}>
          Edytuj
        </Link>
        <DeleteSessionButton
          sessionId={session.id}
          returnTo={returnTo}
          sessionName={session.name}
          className={`${menuItem} text-red hover:text-red`}
        />
      </div>
    </details>
  );
}
