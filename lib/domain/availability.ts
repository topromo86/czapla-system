// Czyste funkcje okien dostępności trenera i slotów na treningi indywidualne.
// Bez dostępu do bazy - cała logika "o której da się zapisać" siedzi tutaj i
// jest w całości testowalna.
//
// Reguła nadrzędna: klient NIE podaje dowolnej godziny. Serwer wylicza listę
// slotów z okien trenera i przyjmuje zapis tylko wtedy, gdy żądany moment
// znajduje się na tej liście (buildSlots + findSlot). Dzięki temu zapis na
// 23:00 jest niemożliwy nawet przy spreparowanym formularzu, a nie tylko
// schowany w UI.

import {
  addCalendarDays,
  calendarWeekday,
  todayInTimeZone,
  zonedTimeToUtc,
  type CalendarDate,
} from "@/lib/domain/time";

// Ile godzin przed startem slot znika z listy - nikt nie rezerwuje treningu
// "za pięć minut", trener musi mieć szansę zobaczyć zapis.
export const MIN_BOOKING_LEAD_HOURS = 2;

// Jak daleko w przód klient widzi wolne terminy.
export const INDIVIDUAL_HORIZON_DAYS = 14;

export const SLOT_MINUTES_OPTIONS = [30, 45, 60, 90] as const;

export const WEEKDAY_LABELS = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
] as const;

// "16:00" -> 960. Zwraca null dla czegokolwiek, co nie jest poprawną godziną -
// wywołujący ma potraktować to jako błąd walidacji, nie podstawiać zera.
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// 960 -> "16:00".
export function formatMinutesAsTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type AvailabilityWindowLike = {
  id: string;
  trainerId: string;
  locationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export type WindowValidationError =
  | "INVALID_WEEKDAY"
  | "INVALID_START_TIME"
  | "INVALID_END_TIME"
  | "END_BEFORE_START"
  | "INVALID_SLOT_MINUTES"
  | "WINDOW_SHORTER_THAN_SLOT";

export function validateWindow(input: {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}): WindowValidationError | null {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    return "INVALID_WEEKDAY";
  }
  const start = parseTimeToMinutes(input.startTime);
  if (start == null) return "INVALID_START_TIME";
  const end = parseTimeToMinutes(input.endTime);
  if (end == null) return "INVALID_END_TIME";
  if (end <= start) return "END_BEFORE_START";
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes <= 0) {
    return "INVALID_SLOT_MINUTES";
  }
  // Okno krótsze niż jeden slot nie wyprodukowałoby żadnego terminu - lepiej
  // odrzucić przy zapisie niż zostawić właścicielowi puste, "działające" okno.
  if (end - start < input.slotMinutes) return "WINDOW_SHORTER_THAN_SLOT";
  return null;
}

// Sloty w obrębie jednego okna, jako offsety minutowe od północy. Ostatni
// niepełny kawałek jest pomijany - trening ma trwać tyle, ile deklaruje slot.
export function slotStartsWithinWindow(window: {
  startTime: string;
  endTime: string;
  slotMinutes: number;
}): number[] {
  const start = parseTimeToMinutes(window.startTime);
  const end = parseTimeToMinutes(window.endTime);
  if (start == null || end == null || window.slotMinutes <= 0) return [];

  const starts: number[] = [];
  for (let at = start; at + window.slotMinutes <= end; at += window.slotMinutes) {
    starts.push(at);
  }
  return starts;
}

export type Slot = {
  windowId: string;
  trainerId: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
};

export type BuildSlotsInput = {
  windows: readonly AvailabilityWindowLike[];
  // Momenty startu already-zajętych treningów indywidualnych tego trenera.
  busyStarts: readonly Date[];
  now: Date;
  horizonDays?: number;
  leadHours?: number;
};

// Pełna lista wolnych slotów w horyzoncie: okna trenera minus terminy już
// zajęte, minus wszystko, co startuje zbyt blisko "teraz".
export function buildSlots(input: BuildSlotsInput): Slot[] {
  const horizonDays = input.horizonDays ?? INDIVIDUAL_HORIZON_DAYS;
  const leadHours = input.leadHours ?? MIN_BOOKING_LEAD_HOURS;
  const earliest = new Date(input.now.getTime() + leadHours * 3_600_000);
  const busy = new Set(input.busyStarts.map((d) => d.getTime()));

  const today = todayInTimeZone(input.now);
  const slots: Slot[] = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const date: CalendarDate = addCalendarDays(today, offset);
    const weekday = calendarWeekday(date);

    for (const window of input.windows) {
      if (window.weekday !== weekday) continue;

      for (const startMinutes of slotStartsWithinWindow(window)) {
        const startsAt = zonedTimeToUtc(
          date.year,
          date.month,
          date.day,
          Math.floor(startMinutes / 60),
          startMinutes % 60,
        );
        if (startsAt < earliest) continue;
        if (busy.has(startsAt.getTime())) continue;

        slots.push({
          windowId: window.id,
          trainerId: window.trainerId,
          locationId: window.locationId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + window.slotMinutes * 60_000),
        });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// Weryfikacja żądania zapisu: czy dokładnie ten moment jest wolnym slotem tego
// trenera. Serwer musi to wywołać przed utworzeniem sesji - to jest miejsce,
// w którym odpada zapis na godzinę spoza okien.
export function findSlot(slots: readonly Slot[], trainerId: string, startsAt: Date): Slot | null {
  return (
    slots.find(
      (slot) => slot.trainerId === trainerId && slot.startsAt.getTime() === startsAt.getTime(),
    ) ?? null
  );
}

export type SessionTimeError =
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "INVALID_DURATION"
  | "IN_THE_PAST";

// Walidacja ręcznie dodawanych zajęć grupowych (ekran właściciela). Zwraca
// wyliczone startsAt/endsAt albo powód odrzucenia.
export function resolveSessionTime(input: {
  date: string; // "2026-07-20"
  time: string; // "18:00"
  durationMin: number;
  now: Date;
  allowPast?: boolean;
}): { startsAt: Date; endsAt: Date } | { error: SessionTimeError } {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date.trim());
  if (!dateMatch) return { error: "INVALID_DATE" };
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { error: "INVALID_DATE" };

  const minutes = parseTimeToMinutes(input.time);
  if (minutes == null) return { error: "INVALID_TIME" };

  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) {
    return { error: "INVALID_DURATION" };
  }

  const startsAt = zonedTimeToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60);
  // Podana data musi istnieć w kalendarzu - 31 lutego przewinęłoby się na marzec.
  const roundTrip = todayInTimeZone(startsAt);
  if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day) {
    return { error: "INVALID_DATE" };
  }

  if (!input.allowPast && startsAt <= input.now) return { error: "IN_THE_PAST" };

  return { startsAt, endsAt: new Date(startsAt.getTime() + input.durationMin * 60_000) };
}

// Kolizja terminów trenera - dwa zajęcia nie mogą się nakładać, bo trener nie
// prowadzi dwóch rzeczy naraz. Sesja edytowana (ignoreSessionId) nie koliduje
// sama ze sobą.
export function findOverlappingSession<T extends { id: string; startsAt: Date; endsAt: Date }>(
  existing: readonly T[],
  candidate: { startsAt: Date; endsAt: Date },
  ignoreSessionId?: string,
): T | null {
  return (
    existing.find(
      (session) =>
        session.id !== ignoreSessionId &&
        session.startsAt < candidate.endsAt &&
        candidate.startsAt < session.endsAt,
    ) ?? null
  );
}
