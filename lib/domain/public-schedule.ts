// Publiczny harmonogram - to, co klub pokazuje na swojej stronie bez logowania.
//
// Obowiązuje tu jedna twarda zasada: wychodzą stąd wyłącznie informacje
// o ZAJĘCIACH, nigdy o ludziach, którzy na nie chodzą. Dlatego kształt
// odpowiedzi jest wypisany jawnie, pole po polu, zamiast oddawać rekord
// z bazy - dołożenie kolumny do modelu Session nie wypchnie wtedy nowych
// danych na zewnątrz przez przypadek.
//
// Liczba wolnych miejsc jest informacją o sali, nie o osobie, więc zostaje -
// bez niej "zapisz się" na komplet byłoby ślepym zaułkiem.

// Ile dni harmonogramu oddajemy domyślnie. Dwa tygodnie: klub generuje
// terminy na 8 tygodni do przodu, ale strona ma pokazywać najbliższe zajęcia,
// a nie kalendarz na kwartał.
export const PUBLIC_SCHEDULE_DEFAULT_DAYS = 14;

// Górna granica dla parametru `dni`. Zapytanie o 3650 dni ma zwrócić
// maksimum, a nie skanować całą tabelę.
export const PUBLIC_SCHEDULE_MAX_DAYS = 35;

export function publicScheduleDays(raw: string | null | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return PUBLIC_SCHEDULE_DEFAULT_DAYS;
  return Math.min(Math.trunc(parsed), PUBLIC_SCHEDULE_MAX_DAYS);
}

// Nadkomplet (więcej rezerwacji niż miejsc) jest możliwy przy ręcznym
// dopisaniu przez trenera - na stronie ma się pokazać "brak miejsc",
// a nie liczba ujemna.
export function freeSlots(capacity: number, bookedCount: number): number {
  return Math.max(0, capacity - bookedCount);
}

export type PublicScheduleSource = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  categoryName: string | null;
  // Klucz koloru rodzaju z palety (lib/domain/class-color.ts) - ten sam, co
  // na grafiku w panelu. Wychodzi na zewnątrz, żeby grafik na witrynie klubu
  // malował te same grupy tym samym kolorem; inaczej "Boks Junior" byłby
  // zielony w panelu i niebieski na stronie.
  categoryColor: string | null;
  locationName: string;
  trainerName: string;
  bookedCount: number;
};

export type PublicScheduleSession = {
  id: string;
  name: string;
  category: string | null;
  categoryColor: string | null;
  location: string;
  trainer: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  freeSlots: number;
};

export function toPublicScheduleSession(source: PublicScheduleSource): PublicScheduleSession {
  return {
    id: source.id,
    name: source.name,
    category: source.categoryName,
    categoryColor: source.categoryColor,
    location: source.locationName,
    trainer: source.trainerName,
    startsAt: source.startsAt.toISOString(),
    endsAt: source.endsAt.toISOString(),
    capacity: source.capacity,
    freeSlots: freeSlots(source.capacity, source.bookedCount),
  };
}
