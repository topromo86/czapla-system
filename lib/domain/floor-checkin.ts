// Czyste funkcje odbić wejścia na salę (skaner QR). Bez dostępu do bazy - cała
// logika "czy to nowe wejście, czy jeszcze to samo" i "czy wizyta jest już
// ważna" siedzi tutaj i jest testowalna.
//
// Wariant "tylko wejście" (wybór właściciela): jedno odbicie zapisuje godzinę
// wejścia. floorMinMinutes pełni dwie role:
//  1. okno anty-dublowania - powtórne odbicie tej samej osoby w tym czasie to
//     wciąż to samo wejście (nie tworzymy drugiego rekordu),
//  2. próg ważności - wizyta liczy się dopiero, gdy od wejścia minęło tyle
//     minut (gasi "odbił i wyszedł").

export type ScanOutcome = "NEW_ENTRY" | "ALREADY_ON_FLOOR";

const MINUTE_MS = 60_000;

// Ile pełnych minut minęło od wejścia. Nigdy ujemne (zegary bywają rozjechane).
export function elapsedMinutes(enteredAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / MINUTE_MS));
}

// Decyzja przy zeskanowaniu kodu: nowe wejście czy jeszcze to samo. Gdy ostatnie
// wejście tej osoby padło w oknie floorMinMinutes, traktujemy skan jako to samo
// wejście - inaczej ktoś "nabiłby" kilka wejść jednym pokazaniem kodu. Przy
// minMinutes = 0 nie ma okna, więc każde odbicie jest nowym wejściem.
export function resolveScanOutcome(input: {
  lastEnteredAt: Date | null;
  now: Date;
  minMinutes: number;
}): ScanOutcome {
  if (!input.lastEnteredAt) return "NEW_ENTRY";
  if (input.minMinutes <= 0) return "NEW_ENTRY";
  const withinWindow =
    input.now.getTime() - input.lastEnteredAt.getTime() < input.minMinutes * MINUTE_MS;
  return withinWindow ? "ALREADY_ON_FLOOR" : "NEW_ENTRY";
}

// Czy wizyta jest już ważna - minęło co najmniej tyle minut, ile wymaga klub.
// Przy progu 0 wizyta jest ważna od razu po wejściu.
export function isVisitValid(enteredAt: Date, now: Date, minMinutes: number): boolean {
  if (minMinutes <= 0) return true;
  return elapsedMinutes(enteredAt, now) >= minMinutes;
}

// Ile minut jeszcze zostało do spełnienia progu (0, gdy już ważna). Do pokazania
// obsłudze stacji: "wejście 12:03, brakuje jeszcze 8 min".
export function minutesUntilValid(enteredAt: Date, now: Date, minMinutes: number): number {
  if (minMinutes <= 0) return 0;
  return Math.max(0, minMinutes - elapsedMinutes(enteredAt, now));
}
