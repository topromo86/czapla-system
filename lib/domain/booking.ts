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
  memberApproved: boolean;
  memberBirthDate: Date;
  memberIsMinor: boolean;
  grantedConsentKeys: ReadonlySet<string>;
  // Czy podpisane (papierowe) zgody zostały dostarczone i potwierdzone przez
  // trenera/admina. Do czasu potwierdzenia klient może zapisać się tylko na
  // pierwsze zajęcia (patrz hasOtherActiveBooking).
  consentsDelivered: boolean;
  // Czy klient ma już inną aktywną (nieodwołaną) rezerwację. Pierwsze zajęcia
  // wolno zarezerwować bez dostarczonych zgód; kolejne - dopiero po odbiorze.
  hasOtherActiveBooking: boolean;
  activePass: PassLike | null;
  session: SessionLike;
  bookedCount: number;
};

export type BookingRejectionReason =
  | "NOT_APPROVED"
  | "SESSION_CANCELLED"
  | "ALREADY_STARTED"
  | "MISSING_CONSENTS"
  | "CONSENTS_NOT_DELIVERED"
  | "NO_ACTIVE_PASS"
  | "AGE_NOT_ELIGIBLE";

export type BookingEligibilityResult =
  { ok: true; willWaitlist: boolean } | { ok: false; reason: BookingRejectionReason };

// Jedna funkcja egzekwująca regułę 9 z CLAUDE.md: bez kompletu zgód nie ma
// rezerwacji, sprawdzane tutaj (wywoływane server-side, nigdy tylko w UI).
export function evaluateBookingEligibility(
  input: BookingEligibilityInput,
): BookingEligibilityResult {
  // Konto niezatwierdzone (samodzielna rejestracja nieletniego czekająca na
  // akceptację klubu, albo odrzucona) nie rezerwuje niczego - to brama wejścia,
  // sprawdzana server-side tak samo jak zgody.
  if (!input.memberApproved) {
    return { ok: false, reason: "NOT_APPROVED" };
  }
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

  // Papierowa brama: zgody zaakceptowane w aplikacji to nie wszystko - podpisany
  // wydruk trzeba dostarczyć trenerowi/adminowi. Do potwierdzenia odbioru wolno
  // zapisać się tylko na PIERWSZE zajęcia; kolejne dopiero po odbiorze.
  if (!input.consentsDelivered && input.hasOtherActiveBooking) {
    return { ok: false, reason: "CONSENTS_NOT_DELIVERED" };
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

// Kod, który akcja zapisu doczepia do adresu powrotnego. Poza powodami odmowy
// jest tu ALREADY_BOOKED - nie pochodzi z oceny uprawnień, tylko ze stanu
// rezerwacji, ale dla klienta jest takim samym komunikatem.
export type BookingErrorCode = BookingRejectionReason | "ALREADY_BOOKED";

// Jedna lista komunikatów dla wszystkich ekranów, z których da się zapisać:
// planner w /app i strona pojedynczych zajęć /zapis (wejście z witryny klubu).
// Wcześniej mapa siedziała w pliku plannera - drugi ekran musiałby ją powielić,
// a powielone komunikaty rozjeżdżają się przy pierwszej zmianie treści.
export const BOOKING_ERROR_MESSAGE: Record<BookingErrorCode, string> = {
  NOT_APPROVED:
    "Konto czeka na zatwierdzenie przez klub - zapis na zajęcia będzie możliwy po akceptacji.",
  CONSENTS_NOT_DELIVERED:
    "Dostarcz podpisane zgody trenerowi lub w recepcji - do potwierdzenia odbioru możesz zapisać się tylko na pierwsze zajęcia.",
  ALREADY_BOOKED: "Jesteś już zapisany na te zajęcia.",
  SESSION_CANCELLED: "Te zajęcia zostały odwołane.",
  ALREADY_STARTED: "Te zajęcia już się rozpoczęły.",
  MISSING_CONSENTS: "Brakuje wymaganych zgód - uzupełnij je w zakładce Zgody.",
  NO_ACTIVE_PASS: "Brak aktywnego karnetu - skontaktuj się z klubem.",
  AGE_NOT_ELIGIBLE: "Wiek nie pasuje do tej grupy zajęciowej.",
};

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
