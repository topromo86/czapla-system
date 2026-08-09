// Czyste funkcje okien dostępności trenera i slotów na treningi indywidualne.
// Bez dostępu do bazy - cała logika "o której da się zapisać" siedzi tutaj i
// jest w całości testowalna.
//
// Reguła nadrzędna: klient NIE podaje dowolnej godziny. Serwer wylicza listę
// slotów z okien trenera i przyjmuje zapis tylko wtedy, gdy żądany moment
// znajduje się na tej liście (buildSlots + findSlot). Dzięki temu zapis na
// 23:00 jest niemożliwy nawet przy spreparowanym formularzu, a nie tylko
// schowany w UI.
//
// Druga reguła: SALA jest zasobem, nie tylko trener. W Mikołowie i w Tychach
// w jednym momencie trwa najwyżej jeden trening indywidualny - klub ma dwie
// sale, nie dwanaście. Jeśli o 17:00 we wtorek ktoś umówił się z Jackiem w
// Mikołowie, to 17:00 w Mikołowie jest zajęte dla wszystkich pozostałych
// trenerów, choćby mieli wolne okno. Tychy w tym samym czasie zostają wolne.
// Zajęcia grupowe zajmują salę tak samo jak indywidualne - w sali z grupą nie
// da się prowadzić treningu jeden na jeden.
//
// Dlatego trenerzy mogą spokojnie wpisywać te same dni i godziny dostępności:
// klient wybiera, z kim chce trenować, a system pilnuje, żeby dwie osoby nie
// stanęły w tej samej sali o tej samej porze.

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

// Zajęty kawałek grafiku: konkretne zajęcia (grupowe albo indywidualne), które
// blokują i trenera, i salę.
export type BusyInterval = {
  trainerId: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
};

// Dlaczego slot odpadł. TRAINER_BUSY = ten trener ma wtedy co innego,
// ROOM_BUSY = sala jest wtedy zajęta przez kogoś innego.
export type SlotBlockReason = "TRAINER_BUSY" | "ROOM_BUSY";

export type Slot = {
  windowId: string;
  trainerId: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  // null = wolny slot, można się zapisać.
  blockedBy: SlotBlockReason | null;
};

export type BuildSlotsInput = {
  windows: readonly AvailabilityWindowLike[];
  // Wszystko, co już stoi w grafiku w horyzoncie - zajęcia grupowe i wcześniej
  // umówione treningi indywidualne, ze WSZYSTKICH sal, nie tylko tej jednej.
  busy: readonly BusyInterval[];
  now: Date;
  horizonDays?: number;
  leadHours?: number;
};

function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

// Pełna lista slotów w horyzoncie - także tych zajętych, z powodem blokady.
// Zajęte zostają na liście celowo: klient ma zobaczyć, że o 17:00 w Mikołowie
// nic nie kupi, ale ta sama godzina jest wolna w Tychach. Sama godzina
// wycięta z listy bez słowa wygląda jak awaria, a nie jak informacja.
//
// Kolejność sprawdzania ma znaczenie: najpierw trener, potem sala. Kiedy to
// ten sam trener jest zajęty, powód "sala zajęta" byłby mylący.
export function buildSlots(input: BuildSlotsInput): Slot[] {
  const horizonDays = input.horizonDays ?? INDIVIDUAL_HORIZON_DAYS;
  const leadHours = input.leadHours ?? MIN_BOOKING_LEAD_HOURS;
  const earliest = new Date(input.now.getTime() + leadHours * 3_600_000);

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

        const candidate = {
          startsAt,
          endsAt: new Date(startsAt.getTime() + window.slotMinutes * 60_000),
        };

        // Nakładanie się, nie równość godzin: trening 60-minutowy od 17:00
        // zajmuje salę także temu, kto ma sloty półgodzinne i celuje w 17:30.
        const trainerBusy = input.busy.some(
          (busy) => busy.trainerId === window.trainerId && overlaps(candidate, busy),
        );
        const roomBusy = input.busy.some(
          (busy) => busy.locationId === window.locationId && overlaps(candidate, busy),
        );
        const blockedBy: SlotBlockReason | null = trainerBusy
          ? "TRAINER_BUSY"
          : roomBusy
            ? "ROOM_BUSY"
            : null;

        slots.push({
          windowId: window.id,
          trainerId: window.trainerId,
          locationId: window.locationId,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          blockedBy,
        });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function isSlotFree(slot: Slot): boolean {
  return slot.blockedBy === null;
}

// Slot o danej godzinie u danego trenera - wolny albo nie. Do komunikatów
// ("sala zajęta") i do podglądu w panelu trenera.
export function findSlotAt(slots: readonly Slot[], trainerId: string, startsAt: Date): Slot | null {
  return (
    slots.find(
      (slot) => slot.trainerId === trainerId && slot.startsAt.getTime() === startsAt.getTime(),
    ) ?? null
  );
}

// Weryfikacja żądania zapisu: czy dokładnie ten moment jest WOLNYM slotem tego
// trenera. Serwer musi to wywołać przed utworzeniem sesji - to jest miejsce,
// w którym odpada zapis na godzinę spoza okien i na zajętą salę.
export function findSlot(slots: readonly Slot[], trainerId: string, startsAt: Date): Slot | null {
  const slot = findSlotAt(slots, trainerId, startsAt);
  return slot && isSlotFree(slot) ? slot : null;
}

// Ta sama godzina, wolna, ale w innej sali - podpowiedź przy zablokowanym
// terminie ("zajęte w Mikołowie, wolne w Tychach").
export function findSlotInOtherRoom(slots: readonly Slot[], slot: Slot): Slot | null {
  return (
    slots.find(
      (other) =>
        isSlotFree(other) &&
        other.locationId !== slot.locationId &&
        other.startsAt.getTime() === slot.startsAt.getTime(),
    ) ?? null
  );
}

export type SessionTimeError = "INVALID_DATE" | "INVALID_TIME" | "INVALID_DURATION" | "IN_THE_PAST";

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
