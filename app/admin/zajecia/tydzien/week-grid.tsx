import React from "react";
import Link from "next/link";
import {
  collapseEmptyHours,
  gridCellKey,
  hourRange,
  hoursInRange,
  weekDays,
} from "@/lib/domain/schedule";
import { plural } from "@/lib/domain/polish";
import type { CalendarDate } from "@/lib/domain/time";
import { formatTime } from "@/lib/format";
import { DeleteSessionButton } from "./delete-session-button";

// Szerokość kolumny godzin + siedem dni. Jedno miejsce, bo tej samej siatki
// używa wiersz zwiniętej przerwy, żeby kolumny się nie rozjechały.
const GRID_COLUMNS = "3.5rem repeat(7, minmax(0, 1fr))";

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

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
  // Klasa paska z kolorem rodzaju - wyliczana na stronie, dla całej listy
  // rodzajów naraz (lib/domain/class-color.ts), żeby kolory się nie powtarzały.
  stripe: string;
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
  const busyHours = new Set<number>();
  for (const s of sessions) {
    const hour = localHour(s.startsAt);
    busyHours.add(hour);
    const key = `${localDayKey(s.startsAt)}T${String(hour).padStart(2, "0")}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(s);
    else byCell.set(key, [s]);
  }

  // Godziny bez ani jednych zajęć w całym tygodniu zwijamy - przerwa między
  // porankiem a wieczorem potrafiła zajmować więcej ekranu niż sam grafik.
  const rows = collapseEmptyHours(hours, busyHours);

  const todayKey = localDayKey(now);

  return (
    // Na wąskich ekranach siatka przewija się w poziomie; na desktopie (gdzie
    // admin zarządza) overflow wyłączamy, inaczej auto-overflow w pionie
    // przycinałby menu kafelków z dolnego rzędu.
    <div className="overflow-x-auto lg:overflow-x-visible">
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
              <GridRow
                key={row.hour}
                hour={row.hour}
                empty={row.empty}
                days={days}
                byCell={byCell}
                now={now}
                returnTo={returnTo}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function GridRow({
  hour,
  empty,
  days,
  byCell,
  now,
  returnTo,
}: {
  hour: number;
  empty: boolean;
  days: CalendarDate[];
  byCell: Map<string, GridSession[]>;
  now: Date;
  returnTo: string;
}) {
  // Pusta godzina zostaje w siatce (oś czasu ma być ciągła), ale na jedną
  // trzecią wysokości - nie ma tam czego pokazywać.
  const cellHeight = empty ? "min-h-5" : "min-h-14";

  return (
    <>
      <div
        className={`text-muted-brand border-line-soft border-t text-right font-mono text-xs ${
          empty ? "py-0.5 opacity-60" : "py-2"
        }`}
      >
        {hourLabel(hour)}
      </div>
      {days.map((day) => {
        const cellSessions = byCell.get(gridCellKey(day, hour)) ?? [];
        return (
          <div
            key={`${dayKeyOf(day)}-${hour}`}
            className={`border-line-soft flex flex-col gap-1 border-t py-1 ${cellHeight}`}
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

// Zwinięta przerwa: jeden pasek zamiast kilku pustych pasów. Natywne <details>,
// więc rozwijanie działa bez JS - tak jak menu kafelków.
function CollapsedGap({ hours, days }: { hours: number[]; days: CalendarDate[] }) {
  const from = hours[0];
  const to = hours[hours.length - 1];
  const label = `${hours.length} ${plural(hours.length, {
    one: "godzina",
    few: "godziny",
    many: "godzin",
  })} bez zajęć`;

  return (
    <details className="border-line-soft col-span-full border-t">
      <summary className="text-muted-brand hover:text-brand-red flex cursor-pointer items-center gap-2 py-1 font-mono text-[11px] tracking-widest uppercase [&::-webkit-details-marker]:hidden">
        <span className="border-line-soft flex-1 border-b" aria-hidden="true" />
        <span>
          + {label} · {hourLabel(from)}-{hourLabel(to)}
        </span>
        <span className="border-line-soft flex-1 border-b" aria-hidden="true" />
      </summary>

      {/* Rozwinięte godziny dostają tę samą siatkę kolumn, więc oś czasu
          i dni zostają w jednej linii z resztą grafiku. */}
      <div className="grid gap-1" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {hours.map((hour) => (
          <React.Fragment key={hour}>
            <div className="text-muted-brand border-line-soft border-t py-2 text-right font-mono text-xs">
              {hourLabel(hour)}
            </div>
            {days.map((day) => (
              <div
                key={`${dayKeyOf(day)}-${hour}`}
                className="border-line-soft min-h-14 border-t"
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </details>
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
    return (
      <div className={`rounded-md border p-1.5 text-left ${tone} ${session.stripe}`}>
        {tileContent}
      </div>
    );
  }

  const editHref = `/admin/zajecia?edit=${session.id}`;
  const menuItem =
    "text-text hover:text-brand-red hover:bg-surface-2 block w-full rounded px-2 py-1.5 text-left text-xs";

  return (
    <details name="planner-tile" className="group/tile relative">
      <summary
        className={`list-none rounded-md border p-1.5 text-left ${tone} ${session.stripe} hover:border-brand-red/60 cursor-pointer [&::-webkit-details-marker]:hidden`}
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
