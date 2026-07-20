// Sugestie kolejnych zajęć na podstawie historii obecności.
//
// Zasada: sugerujemy to, co klient realnie robi, a nie to, co kiedyś raz
// spróbował. Sygnałem jest nawyk - powtarzalny slot (dzień tygodnia + godzina
// + rodzaj zajęć w danej lokalizacji). Jednorazowa wizyta nawykiem nie jest,
// więc nie generuje sugestii; inaczej klient dostawałby propozycje zajęć,
// na których był raz pół roku temu.
//
// Liczymy wyłącznie faktyczne obecności (Attendance), nie same zapisy.
// Zapis, na który ktoś nie przyszedł, jest sygnałem przeciwnym niż nawyk.

export type AttendedSession = {
  startsAt: Date;
  weekday: number; // 1 = poniedziałek ... 7 = niedziela
  hour: number; // godzina lokalna startu
  categoryKey: string; // rodzaj zajęć; gdy brak kategorii - nazwa zajęć
  locationId: string;
};

export type CandidateSession = {
  id: string;
  startsAt: Date;
  weekday: number;
  hour: number;
  categoryKey: string;
  locationId: string;
  freeSpots: number;
};

export type Suggestion = {
  sessionId: string;
  // Ile razy klient był na tym slocie w analizowanym okresie.
  visits: number;
  // Ile tygodni temu był ostatnio na tym slocie (0 = w tym tygodniu).
  weeksSinceLast: number;
  score: number;
  reason: string;
};

// Ile tygodni historii bierzemy pod uwagę. Kwartał to kompromis: dość długo,
// by nawyk się ujawnił, i dość krótko, by porzucony nawyk sprzed pół roku
// nie wracał jako sugestia.
export const HISTORY_WEEKS = 12;

// Poniżej dwóch wizyt nie mówimy o nawyku.
export const MIN_VISITS_FOR_PATTERN = 2;

// Nawyk porzucony na ponad półtora miesiąca przestaje być nawykiem.
export const MAX_WEEKS_SINCE_LAST = 6;

function slotKey(s: { weekday: number; hour: number; categoryKey: string; locationId: string }) {
  return `${s.weekday}|${s.hour}|${s.categoryKey}|${s.locationId}`;
}

function weeksBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (7 * 86_400_000));
}

type Pattern = { visits: number; lastVisit: Date };

// Zbiera nawyki z historii. Wyeksportowane osobno, bo przydaje się też do
// pokazania klientowi "twoje stałe terminy".
export function buildPatterns(history: readonly AttendedSession[], now: Date): Map<string, Pattern> {
  const cutoff = new Date(now.getTime() - HISTORY_WEEKS * 7 * 86_400_000);
  const patterns = new Map<string, Pattern>();

  for (const visit of history) {
    if (visit.startsAt < cutoff || visit.startsAt > now) continue;

    const key = slotKey(visit);
    const existing = patterns.get(key);
    if (existing) {
      existing.visits += 1;
      if (visit.startsAt > existing.lastVisit) existing.lastVisit = visit.startsAt;
    } else {
      patterns.set(key, { visits: 1, lastVisit: visit.startsAt });
    }
  }

  return patterns;
}

function describe(visits: number, weeksSinceLast: number): string {
  if (weeksSinceLast === 0) return `Twój stały termin - byłeś tu w tym tygodniu`;
  if (weeksSinceLast === 1) return `Twój stały termin - ostatnio tydzień temu`;
  return `Byłeś tu ${visits} razy, ostatnio ${weeksSinceLast} tyg. temu`;
}

// Sugestie posortowane od najmocniejszej. Wynik jest deterministyczny:
// przy równym score decyduje wcześniejszy termin, a potem id - dzięki temu
// ta sama historia zawsze daje tę samą listę i da się to testować.
export function suggestSessions(input: {
  history: readonly AttendedSession[];
  candidates: readonly CandidateSession[];
  bookedSessionIds: readonly string[];
  now: Date;
  limit?: number;
}): Suggestion[] {
  const patterns = buildPatterns(input.history, input.now);
  const booked = new Set(input.bookedSessionIds);
  const out: Suggestion[] = [];

  for (const candidate of input.candidates) {
    // Nie sugerujemy tego, na co klient już jest zapisany, ani zajęć bez
    // wolnych miejsc - sugestia, której nie da się przyjąć, tylko irytuje.
    if (booked.has(candidate.id)) continue;
    if (candidate.freeSpots <= 0) continue;
    if (candidate.startsAt <= input.now) continue;

    const pattern = patterns.get(slotKey(candidate));
    if (!pattern) continue;
    if (pattern.visits < MIN_VISITS_FOR_PATTERN) continue;

    const weeksSinceLast = weeksBetween(pattern.lastVisit, input.now);
    if (weeksSinceLast > MAX_WEEKS_SINCE_LAST) continue;

    // Częstotliwość waży więcej niż świeżość, ale świeżość rozstrzyga remisy
    // między slotami o tej samej liczbie wizyt.
    const score = pattern.visits * 10 - weeksSinceLast;

    out.push({
      sessionId: candidate.id,
      visits: pattern.visits,
      weeksSinceLast,
      score,
      reason: describe(pattern.visits, weeksSinceLast),
    });
  }

  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sa = byId.get(a.sessionId)!.startsAt.getTime();
    const sb = byId.get(b.sessionId)!.startsAt.getTime();
    if (sa !== sb) return sa - sb;
    return a.sessionId.localeCompare(b.sessionId);
  });

  // Jeden slot = jedna sugestia. Bez tego klient dostałby ten sam poniedziałek
  // 18:00 z czterech kolejnych tygodni naraz.
  const seenSlot = new Set<string>();
  const deduped: Suggestion[] = [];
  for (const s of out) {
    const key = slotKey(byId.get(s.sessionId)!);
    if (seenSlot.has(key)) continue;
    seenSlot.add(key);
    deduped.push(s);
  }

  return deduped.slice(0, input.limit ?? 3);
}
