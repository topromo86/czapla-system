// Konwersje czasu lokalnego Europe/Warsaw <-> UTC, oparte o wbudowane dane ICU
// w Node.js (Intl) - bez zewnętrznej biblioteki. CLAUDE.md: nigdy nie licz dat
// w UTC bez konwersji, bo godziny zajęć rozjadą się przy zmianie czasu.

export const CLUB_TIMEZONE = "Europe/Warsaw";

function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

// Zamienia lokalny czas ścienny (rok, miesiąc 1-12, dzień, godzina, minuta) w danej
// strefie na właściwy moment UTC - poprawnie dla CET/CEST, bez ręcznego zgadywania miesięcy.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = CLUB_TIMEZONE,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = timeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

export type CalendarDate = { year: number; month: number; day: number };

// Dzisiejsza data kalendarzowa w danej strefie czasowej (nie w UTC serwera).
export function todayInTimeZone(now: Date, timeZone: string = CLUB_TIMEZONE): CalendarDate {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

// Czysta arytmetyka kalendarzowa (bez stref czasowych) - dodaje dni do daty kalendarzowej.
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Dzień tygodnia danej daty kalendarzowej: 0 = niedziela ... 6 = sobota (konwencja
// JS Date.getUTCDay(), taka sama jak w ClassTemplate.weekday).
export function calendarWeekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}
