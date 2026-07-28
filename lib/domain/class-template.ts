// Czyste funkcje dla cyklicznych planów zajęć (ClassTemplate). Plan opisuje
// zajęcia powtarzające się co tydzień "do odwołania": dzień tygodnia + godzina
// startu. Job generateSessions rozwija plan na konkretne sesje. Bez dostępu do
// bazy - cała walidacja i wyliczanie nazwy siedzą tu i są testowalne.

import { parseTimeToMinutes } from "@/lib/domain/availability";
import type { CalendarDate } from "@/lib/domain/time";

// Nazwa zajęć jest opcjonalna. Gdy właściciel jej nie poda, zajęcia nazywają
// się dokładnie tak jak ich rodzaj (kategoria) - to była wprost prośba: "nazwa
// nie wymagana, bo zajęcia nazywają się tak jak pozycje w RODZAJ".
export function resolveClassName(
  name: string | null | undefined,
  categoryName: string,
): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : categoryName;
}

export type ClassTemplateError =
  | "INVALID_WEEKDAY"
  | "INVALID_TIME"
  | "INVALID_DURATION"
  | "INVALID_CAPACITY"
  | "INVALID_START_DATE";

export type ClassTemplateValues = {
  weekday: number;
  startTime: string; // znormalizowane "HH:MM"
  durationMin: number;
  capacity: number;
  // null = plan obowiązuje od zaraz. W przeciwnym razie sesje generowane są
  // dopiero od tego dnia (kalendarzowo, w czasie klubu).
  startDate: CalendarDate | null;
};

// Walidacja i normalizacja formularza cyklicznego planu. startDate jest
// opcjonalne - pusty string oznacza "od zaraz".
export function validateClassTemplate(input: {
  weekday: number;
  startTime: string;
  durationMin: number;
  capacity: number;
  startDate?: string;
}): { value: ClassTemplateValues } | { error: ClassTemplateError } {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    return { error: "INVALID_WEEKDAY" };
  }

  const minutes = parseTimeToMinutes(input.startTime);
  if (minutes == null) return { error: "INVALID_TIME" };

  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) {
    return { error: "INVALID_DURATION" };
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    return { error: "INVALID_CAPACITY" };
  }

  const startDate = parseStartDate(input.startDate);
  if (startDate === "INVALID") return { error: "INVALID_START_DATE" };

  return {
    value: {
      weekday: input.weekday,
      startTime: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      durationMin: input.durationMin,
      capacity: input.capacity,
      startDate,
    },
  };
}

// "" / undefined -> null (od zaraz). Poprawne "YYYY-MM-DD" -> CalendarDate.
// Cokolwiek innego -> "INVALID".
export function parseStartDate(value: string | undefined): CalendarDate | null | "INVALID" {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return "INVALID";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "INVALID";
  return { year, month, day };
}
