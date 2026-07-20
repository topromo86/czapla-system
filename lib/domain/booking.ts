// Czyste funkcje domenowe rezerwacji - bez dostępu do bazy, w pełni testowalne.
// SPEC.md sekcja 2 "Rezerwacje" i "Check-in QR" są źródłem prawdy dla tych reguł.

import type { PassStatus, SessionStatus } from "@/app/generated/prisma/client";

// Awaryjna wartość okna bezkosztowego odwołania. Realna siedzi w ustawieniach
// klubu (ClubSettings.freeCancellationHours) i to ją trzeba podawać w wywołaniach
// - ta stała ratuje tylko sytuację, w której ustawień nie da się odczytać.
export const FREE_CANCELLATION_WINDOW_HOURS = 24;

// Widełki dla właściciela. Dół to 1h, bo poniżej odwołanie przestaje mieć
// jakikolwiek sens organizacyjny; góra to tydzień, bo dłuższe okno oznacza
// w praktyce "zapisu nie da się odwołać".
export const MIN_CANCELLATION_WINDOW_HOURS = 1;
export const MAX_CANCELLATION_WINDOW_HOURS = 168;

export const CHECK_IN_WINDOW_BEFORE_MIN = 30;
export const CHECK_IN_WINDOW_AFTER_MIN = 20;

export function canCancelFree(
  sessionStartsAt: Date,
  now: Date,
  windowHours: number = FREE_CANCELLATION_WINDOW_HOURS,
): boolean {
  const hoursUntilStart = (sessionStartsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursUntilStart >= windowHours;
}

// Odwołanie poniżej okna = NO_SHOW, wejście przepada (SPEC.md sekcja 2).
export function resolveCancellationOutcome(
  sessionStartsAt: Date,
  now: Date,
  windowHours: number = FREE_CANCELLATION_WINDOW_HOURS,
): "CANCELLED" | "NO_SHOW" {
  return canCancelFree(sessionStartsAt, now, windowHours) ? "CANCELLED" : "NO_SHOW";
}

// Walidacja wartości z formularza. Ułamki godzin odpadają celowo: reguła jest
// komunikowana klientom w godzinach i "2,5h" tylko utrudniałoby jej zrozumienie.
export function parseCancellationWindowHours(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isInteger(value)) return null;
  if (value < MIN_CANCELLATION_WINDOW_HOURS || value > MAX_CANCELLATION_WINDOW_HOURS) return null;
  return value;
}

export function isWithinCheckInWindow(sessionStartsAt: Date, now: Date): boolean {
  const diffMin = (now.getTime() - sessionStartsAt.getTime()) / 60_000;
  return diffMin >= -CHECK_IN_WINDOW_BEFORE_MIN && diffMin <= CHECK_IN_WINDOW_AFTER_MIN;
}

export function calculateAge(birthDate: Date, referenceDate: Date): number {
  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = referenceDate.getUTCDate() - birthDate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export function isAgeEligible(
  birthDate: Date,
  referenceDate: Date,
  minAge?: number | null,
  maxAge?: number | null,
): boolean {
  const age = calculateAge(birthDate, referenceDate);
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

export function requiredConsentKeys(isMinor: boolean): readonly string[] {
  return isMinor ? ["reg", "rodo", "health", "guardian"] : ["reg", "rodo", "health"];
}

export function hasRequiredConsents(
  grantedKeys: ReadonlySet<string>,
  requiredKeys: readonly string[],
): boolean {
  return requiredKeys.every((key) => grantedKeys.has(key));
}

export type PassLike = {
  status: PassStatus;
  endsAt: Date;
  entriesLeft: number | null;
};

// Karnet limitowany: rezerwacja NIE zdejmuje wejścia - to sprawdza tylko, czy
// karnet jest w zasadzie zdatny do użycia (aktywny, niewygasły, z wejściami > 0).
export function isPassUsable(pass: PassLike, now: Date): boolean {
  if (pass.status !== "ACTIVE") return false;
  if (pass.endsAt <= now) return false;
  if (pass.entriesLeft != null && pass.entriesLeft <= 0) return false;
  return true;
}

export function hasFreeSpot(bookedCount: number, capacity: number): boolean {
  return bookedCount < capacity;
}

export type SessionLike = {
  startsAt: Date;
  capacity: number;
  minAge?: number | null;
  maxAge?: number | null;
  status: SessionStatus;
};

export type BookingEligibilityInput = {
  now: Date;
  memberBirthDate: Date;
  memberIsMinor: boolean;
  grantedConsentKeys: ReadonlySet<string>;
  activePass: PassLike | null;
  session: SessionLike;
  bookedCount: number;
};

export type BookingRejectionReason =
  | "SESSION_CANCELLED"
  | "ALREADY_STARTED"
  | "MISSING_CONSENTS"
  | "NO_ACTIVE_PASS"
  | "AGE_NOT_ELIGIBLE";

export type BookingEligibilityResult =
  { ok: true; willWaitlist: boolean } | { ok: false; reason: BookingRejectionReason };

// Jedna funkcja egzekwująca regułę 9 z CLAUDE.md: bez kompletu zgód nie ma
// rezerwacji, sprawdzane tutaj (wywoływane server-side, nigdy tylko w UI).
export function evaluateBookingEligibility(
  input: BookingEligibilityInput,
): BookingEligibilityResult {
  if (input.session.status === "CANCELLED") {
    return { ok: false, reason: "SESSION_CANCELLED" };
  }
  if (input.session.startsAt <= input.now) {
    return { ok: false, reason: "ALREADY_STARTED" };
  }

  const required = requiredConsentKeys(input.memberIsMinor);
  if (!hasRequiredConsents(input.grantedConsentKeys, required)) {
    return { ok: false, reason: "MISSING_CONSENTS" };
  }

  if (!input.activePass || !isPassUsable(input.activePass, input.now)) {
    return { ok: false, reason: "NO_ACTIVE_PASS" };
  }

  if (
    !isAgeEligible(
      input.memberBirthDate,
      input.session.startsAt,
      input.session.minAge,
      input.session.maxAge,
    )
  ) {
    return { ok: false, reason: "AGE_NOT_ELIGIBLE" };
  }

  const willWaitlist = !hasFreeSpot(input.bookedCount, input.session.capacity);
  return { ok: true, willWaitlist };
}

export type WaitlistEntry = { id: string; waitlistPosition: number | null };

// Kto awansuje z listy rezerwowej po zwolnieniu miejsca - najniższa pozycja.
export function nextWaitlistPromotion<T extends WaitlistEntry>(waitlist: readonly T[]): T | null {
  const candidates = waitlist.filter(
    (b): b is T & { waitlistPosition: number } => b.waitlistPosition != null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) =>
    cur.waitlistPosition < best.waitlistPosition ? cur : best,
  );
}

export function nextWaitlistPosition(
  currentWaitlist: readonly { waitlistPosition: number | null }[],
): number {
  const max = currentWaitlist.reduce(
    (m, b) => (b.waitlistPosition != null && b.waitlistPosition > m ? b.waitlistPosition : m),
    0,
  );
  return max + 1;
}
