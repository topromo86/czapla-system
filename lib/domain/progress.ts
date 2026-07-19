// Postępy klienta (SPEC.md sekcja 3, ekran "Postępy"): wykres frekwencji i
// seria. Czyste funkcje na kalendarzowych datach (Europe/Warsaw) - konwersję
// z Attendance.checkedInAt robi wywołujący przez lib/domain/time.ts, żeby ten
// plik nie musiał znać żadnej strefy czasowej.

import { addCalendarDays, calendarWeekday, type CalendarDate } from "./time";

function calendarDateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

// Poniedziałek tygodnia, w którym leży `date` (calendarWeekday: 0=niedziela..6=sobota).
export function mondayOfWeek(date: CalendarDate): CalendarDate {
  const weekday = calendarWeekday(date);
  const daysSinceMonday = (weekday + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

export type WeeklyAttendanceBucket = { weekStart: CalendarDate; count: number };

// Zwraca `weeksBack` tygodni kończących się na tygodniu zawierającym `today`,
// w kolejności chronologicznej (najstarszy pierwszy) - gotowe do narysowania
// wykresu słupkowego bez dalszej obróbki.
export function weeklyAttendanceCounts(
  attendanceDates: CalendarDate[],
  today: CalendarDate,
  weeksBack: number = 12,
): WeeklyAttendanceBucket[] {
  const countByWeek = new Map<string, number>();
  for (const d of attendanceDates) {
    const key = calendarDateKey(mondayOfWeek(d));
    countByWeek.set(key, (countByWeek.get(key) ?? 0) + 1);
  }

  const currentWeekStart = mondayOfWeek(today);
  const buckets: WeeklyAttendanceBucket[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = addCalendarDays(currentWeekStart, -7 * i);
    buckets.push({ weekStart, count: countByWeek.get(calendarDateKey(weekStart)) ?? 0 });
  }
  return buckets;
}

// Liczba kolejnych tygodni (licząc wstecz od bieżącego) z co najmniej jedną
// obecnością, bez przerwy. Bieżący tydzień bez obecności NIE przerywa serii -
// dopiero miniony tydzień bez treningu ją zeruje (klient jeszcze zdąży w tym
// tygodniu przyjść).
export function computeWeeklyStreak(attendanceDates: CalendarDate[], today: CalendarDate): number {
  const weeksWithAttendance = new Set(attendanceDates.map((d) => calendarDateKey(mondayOfWeek(d))));
  const currentWeekStart = mondayOfWeek(today);

  let streak = 0;
  let cursor = currentWeekStart;
  let cursorIndex = 0;
  while (true) {
    const key = calendarDateKey(cursor);
    const hasAttendance = weeksWithAttendance.has(key);
    if (cursorIndex === 0 && !hasAttendance) {
      // bieżący tydzień bez obecności jeszcze się nie liczy jako przerwana seria
      cursor = addCalendarDays(cursor, -7);
      cursorIndex++;
      continue;
    }
    if (!hasAttendance) break;
    streak++;
    cursor = addCalendarDays(cursor, -7);
    cursorIndex++;
  }
  return streak;
}
