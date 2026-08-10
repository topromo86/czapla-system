// Osobisty kod rotacyjny - ten, który klubowicz albo trener pokazuje kamerze
// na sali.
//
// Kod żyje 30 sekund. Nie ma go w bazie: liczy się go z sekretu serwera, id
// konta i numeru 30-sekundowego okna. Dzięki temu telefon może pokazać kod
// nawet bez zasięgu (strona raz wczytana wystarczy), a serwer i tak sprawdzi
// podpis - nie ma czego podrobić bez znajomości sekretu.
//
// Po co rotacja: kod, który nie zmienia się w czasie, da się wysłać koledze i
// odbić się z domu. Trzydzieści sekund oznacza, że trzeba stać przy kamerze
// klubu, a nie mieć zdjęcie w telefonie.

export const CODE_PERIOD_SECONDS = 30;

// Ile okien wstecz i w przód akceptujemy. Jedno w każdą stronę pokrywa
// rozjazd zegarów telefonu i serwera oraz sekundę, w której kod przeskakuje
// w trakcie skanowania. Więcej znaczyłoby wydłużanie życia kodu bez powodu.
export const CODE_TOLERANCE_PERIODS = 1;

export const CODE_PREFIX = "tfc1";

export function periodNumber(now: Date, periodSeconds: number = CODE_PERIOD_SECONDS): number {
  return Math.floor(now.getTime() / 1000 / periodSeconds);
}

// Payload podpisywany przez serwer. Wydzielone, żeby generowanie i weryfikacja
// liczyły dokładnie to samo - rozjazd tych dwóch miejsc to klasyczna dziura.
export function codePayload(userId: string, period: number): string {
  return `${CODE_PREFIX}.${userId}.${period}`;
}

export function buildCode(userId: string, period: number, signature: string): string {
  return `${codePayload(userId, period)}.${signature}`;
}

export type ParsedCode = {
  userId: string;
  period: number;
  signature: string;
};

export function parseCode(raw: string): ParsedCode | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 4) return null;
  const [prefix, userId, periodRaw, signature] = parts;
  if (prefix !== CODE_PREFIX || !userId || !signature) return null;
  const period = Number(periodRaw);
  if (!Number.isInteger(period)) return null;
  return { userId, period, signature };
}

export type CodeRejection = "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE";

// Czy numer okna z kodu mieści się w tolerancji wobec "teraz". Sam podpis
// sprawdza warstwa serwerowa - tutaj tylko czas, bo to jedyna część, która da
// się przetestować bez sekretu.
export function isPeriodAcceptable(
  period: number,
  now: Date,
  periodSeconds: number = CODE_PERIOD_SECONDS,
  tolerance: number = CODE_TOLERANCE_PERIODS,
): boolean {
  return Math.abs(periodNumber(now, periodSeconds) - period) <= tolerance;
}

// Ile sekund zostało do końca okna - do odliczania na ekranie telefonu.
export function secondsLeftInPeriod(
  now: Date,
  periodSeconds: number = CODE_PERIOD_SECONDS,
): number {
  const elapsed = Math.floor(now.getTime() / 1000) % periodSeconds;
  return periodSeconds - elapsed;
}
