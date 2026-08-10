// Czyste funkcje plannera tygodniowego i okna zapisów.
//
// Dwie rzeczy, które muszą być liczone w czasie klubu (Europe/Warsaw), a nie
// w UTC serwera: granica tygodnia i granica okna zapisów. Inaczej reset
// "z niedzieli na poniedziałek" wypadałby o 1:00 albo 2:00 w nocy, zależnie
// od pory roku - patrz CLAUDE.md o zmianie czasu.

import {
  addCalendarDays,
  calendarWeekday,
  todayInTimeZone,
  zonedTimeToUtc,
  type CalendarDate,
} from "@/lib/domain/time";

export type BookingHorizonMode = "CURRENT_WEEK" | "FIXED_DAYS";

export const FIXED_HORIZON_OPTIONS = [7, 14, 21, 28] as const;

// Planner jest tygodniowy pn-nd, więc wszędzie liczymy poniedziałek jako
// początek. Date.getUTCDay() daje 0 = niedziela, stąd przeliczenie.
export function mondayIndex(weekday: number): number {
  return (weekday + 6) % 7;
}

export function startOfWeek(date: CalendarDate): CalendarDate {
  return addCalendarDays(date, -mondayIndex(calendarWeekday(date)));
}

export function weekDays(weekStart: CalendarDate): CalendarDate[] {
  return Array.from({ length: 7 }, (_, offset) => addCalendarDays(weekStart, offset));
}

// Ostatni moment (wyłącznie), na który klient może się zapisać.
//
// CURRENT_WEEK: koniec najbliższej niedzieli - w poniedziałek widać cały
// tydzień, w czwartek już tylko do niedzieli, a o północy z niedzieli na
// poniedziałek okno przeskakuje na kolejny tydzień.
// FIXED_DAYS: koniec dnia oddalonego o N dni od dziś.
export function bookingHorizonEnd(input: {
  mode: BookingHorizonMode;
  days: number;
  now: Date;
}): Date {
  const today = todayInTimeZone(input.now);

  const lastDay =
    input.mode === "CURRENT_WEEK"
      ? addCalendarDays(today, 6 - mondayIndex(calendarWeekday(today)))
      : addCalendarDays(today, input.days);

  // Północ następnego dnia = koniec dnia `lastDay` włącznie, bez bawienia się
  // w 23:59:59.999.
  const dayAfter = addCalendarDays(lastDay, 1);
  return zonedTimeToUtc(dayAfter.year, dayAfter.month, dayAfter.day, 0, 0);
}

export type BookableStatus =
  "BOOKABLE" | "PAST" | "BEYOND_HORIZON" | "CANCELLED" | "FULL" | "ALREADY_BOOKED";

// Status kafelka w plannerze. Świadomie rozdzielone od
// evaluateBookingEligibility (lib/domain/booking.ts): tam sprawdzamy prawo
// KONKRETNEGO klienta (zgody, karnet, wiek), tutaj wyłącznie stan terminu.
// Kafelek "wolne miejsca" nadal może odbić się od braku karnetu przy zapisie.
export function sessionBookableStatus(input: {
  session: {
    startsAt: Date;
    status: string;
    capacity: number;
  };
  bookedCount: number;
  memberAlreadyBooked: boolean;
  now: Date;
  horizonEnd: Date;
}): BookableStatus {
  if (input.session.status === "CANCELLED") return "CANCELLED";
  if (input.memberAlreadyBooked) return "ALREADY_BOOKED";
  if (input.session.startsAt <= input.now) return "PAST";
  if (input.session.startsAt >= input.horizonEnd) return "BEYOND_HORIZON";
  if (input.bookedCount >= input.session.capacity) return "FULL";
  return "BOOKABLE";
}

export const DEFAULT_HOUR_FROM = 8;
export const DEFAULT_HOUR_TO = 21;

// Zakres godzin siatki: liczony z realnych zajęć, żeby planner nie pokazywał
// pustych pasów od 6:00 do 23:00. Puste dane spadają na sensowny domyślny
// zakres, a nie na pustą siatkę.
export function hourRange(
  startHours: readonly number[],
  fallbackFrom = DEFAULT_HOUR_FROM,
  fallbackTo = DEFAULT_HOUR_TO,
): { from: number; to: number } {
  if (startHours.length === 0) return { from: fallbackFrom, to: fallbackTo };
  const min = Math.min(...startHours);
  const max = Math.max(...startHours);
  // +1 żeby ostatnie zajęcia miały swój pas w całości.
  return { from: Math.max(0, min), to: Math.min(23, max + 1) };
}

export function hoursInRange(range: { from: number; to: number }): number[] {
  const hours: number[] = [];
  for (let hour = range.from; hour <= range.to; hour++) hours.push(hour);
  return hours;
}

// Klucz komórki siatki: dzień + godzina startu. Zajęcia o 18:30 lądują
// w pasie 18:00 - planner ma pokazywać rozkład dnia, a nie minutowy kalendarz.
export function gridCellKey(day: CalendarDate, hour: number): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}`;
}

// Wiersz siatki: albo konkretna godzina, albo zwinięta dziura między porannymi
// a popołudniowymi zajęciami.
export type GridRowSpec =
  { kind: "hour"; hour: number; empty: boolean } | { kind: "gap"; hours: number[] };

// Ile pustych godzin z rzędu zwijamy w jeden pasek. Jedna pusta godzina zostaje
// jako godzina - zwinięcie jej w pasek "1 godzina bez zajęć" zajmuje tyle samo
// miejsca, a dokłada klikanie.
export const MIN_COLLAPSED_GAP_HOURS = 2;

// Klub trenuje rano i wieczorem, a między 11:00 a 16:00 siatka to pięć pustych
// pasów - tyle samo miejsca co realny grafik. Zwijamy je w jeden pasek do
// rozwinięcia; pojedyncze puste godziny zostają, tylko niższe (`empty`).
export function collapseEmptyHours(
  hours: readonly number[],
  busyHours: ReadonlySet<number>,
  minGap: number = MIN_COLLAPSED_GAP_HOURS,
): GridRowSpec[] {
  const rows: GridRowSpec[] = [];
  let run: number[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length >= minGap) rows.push({ kind: "gap", hours: run });
    else for (const hour of run) rows.push({ kind: "hour", hour, empty: true });
    run = [];
  };

  for (const hour of hours) {
    if (busyHours.has(hour)) {
      flush();
      rows.push({ kind: "hour", hour, empty: false });
    } else {
      run.push(hour);
    }
  }
  flush();

  return rows;
}

export function describeHorizon(mode: BookingHorizonMode, days: number): string {
  return mode === "CURRENT_WEEK"
    ? "do najbliższej niedzieli włącznie (reset w poniedziałek o północy)"
    : `${days} dni do przodu`;
}
