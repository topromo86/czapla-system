import React from "react";
import { plural } from "@/lib/domain/polish";
import type { CalendarDate } from "@/lib/domain/time";

// Wspólne części siatki tygodniowej: oś godzin, klucze dni i zwinięta przerwa.
// Planner klienta i planner właściciela mają wyglądać identycznie - zajęcia
// o 18:00 muszą lądować w tym samym pasie w obu widokach. Jedno źródło zamiast
// dwóch kopii, które prędzej czy później się rozjadą.

// Szerokość kolumny godzin + siedem dni.
export const GRID_COLUMNS = "3.5rem repeat(7, minmax(0, 1fr))";

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Godzina/dzień w czasie klubu - kafelek ma trafić do pasa, który widać na
// zegarze recepcji, nie w UTC serwera.
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

export function dayKeyOf(day: CalendarDate): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

// Zwinięta przerwa: jeden pasek zamiast kilku pustych pasów między porannymi
// a wieczornymi zajęciami. Natywne <details>, więc rozwijanie działa bez JS.
export function CollapsedGap({ hours, days }: { hours: number[]; days: CalendarDate[] }) {
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
          + {label} · {hourLabel(hours[0])}-{hourLabel(hours[hours.length - 1])}
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

// Etykieta godziny w osi. Pusta godzina zostaje w siatce (oś ma być ciągła),
// ale przygaszona - nie ma tam czego pokazywać.
export function HourLabelCell({ hour, empty }: { hour: number; empty: boolean }) {
  return (
    <div
      className={`text-muted-brand border-line-soft border-t text-right font-mono text-xs ${
        empty ? "py-0.5 opacity-60" : "py-2"
      }`}
    >
      {hourLabel(hour)}
    </div>
  );
}

// Wysokość komórki dnia: pusta godzina na jedną trzecią normalnej.
export function cellHeightClass(empty: boolean): string {
  return empty ? "min-h-5" : "min-h-14";
}
