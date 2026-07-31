// Kolory rodzajów zajęć na grafiku.
//
// Kolor służy WYŁĄCZNIE do odróżniania grup od siebie. Znaczenia (odwołane,
// komplet, przeszłe, zapisany) niosą nadal tło i obramowanie kafelka - dlatego
// rodzaj pokazujemy paskiem z boku, a nie kolorem całego kafelka. Inaczej
// czerwony pasek "Kids" mieszałby się z czerwienią odwołanych zajęć.
//
// Klasy Tailwind są tu wypisane w całości (nie sklejane z fragmentów), bo
// Tailwind skanuje źródła statycznie i nie zobaczyłby `border-l-${key}`.

export type CategoryColorKey =
  | "sky"
  | "violet"
  | "teal"
  | "lime"
  | "rose"
  | "orange"
  | "indigo"
  | "fuchsia"
  | "sienna"
  | "slate";

export type CategoryColor = {
  key: CategoryColorKey;
  label: string;
  /** Pasek przy kafelku na grafiku. */
  stripe: string;
  /** Kropka przy nazwie rodzaju (legenda, lista rodzajów w adminie). */
  dot: string;
};

export const CATEGORY_COLORS: readonly CategoryColor[] = [
  { key: "sky", label: "Błękitny", stripe: "border-l-cat-sky", dot: "bg-cat-sky" },
  { key: "violet", label: "Fioletowy", stripe: "border-l-cat-violet", dot: "bg-cat-violet" },
  { key: "teal", label: "Morski", stripe: "border-l-cat-teal", dot: "bg-cat-teal" },
  { key: "lime", label: "Zielony", stripe: "border-l-cat-lime", dot: "bg-cat-lime" },
  { key: "rose", label: "Różowy", stripe: "border-l-cat-rose", dot: "bg-cat-rose" },
  { key: "orange", label: "Pomarańczowy", stripe: "border-l-cat-orange", dot: "bg-cat-orange" },
  { key: "indigo", label: "Granatowy", stripe: "border-l-cat-indigo", dot: "bg-cat-indigo" },
  { key: "fuchsia", label: "Purpurowy", stripe: "border-l-cat-fuchsia", dot: "bg-cat-fuchsia" },
  { key: "sienna", label: "Brązowy", stripe: "border-l-cat-sienna", dot: "bg-cat-sienna" },
  { key: "slate", label: "Stalowy", stripe: "border-l-cat-slate", dot: "bg-cat-slate" },
] as const;

export function isCategoryColorKey(value: string): value is CategoryColorKey {
  return CATEGORY_COLORS.some((c) => c.key === value);
}

// Awaryjny skrót nazwy - używany dopiero, gdy rodzajów jest więcej niż kolorów
// w palecie. Ta sama nazwa zawsze daje ten sam kolor (żadnego Math.random).
function hashName(name: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

export type ColorableCategory = {
  id: string;
  name: string;
  color?: string | null;
};

// Przydział kolorów dla CAŁEJ listy rodzajów naraz - to jedyne miejsce, które
// o tym decyduje, więc admin i grafik pokazują ten sam kolor.
//
// Rozdajemy kolejne kolory z palety zamiast liczyć skrót z nazwy, bo skrót
// potrafi dać dwóm rodzajom ten sam kolor - a akurat "Kids Boxing" i "Boks
// Junior" wychodziły identyczne, czyli zlewały się dokładnie te dwie grupy,
// które najłatwiej pomylić. Przy przydziale z listy kolizja jest niemożliwa,
// dopóki rodzajów jest nie więcej niż kolorów.
//
// Kolejność wejścia musi być stabilna (sortOrder, potem nazwa) - inaczej kolory
// skakałyby między odświeżeniami.
export function assignCategoryColors(
  categories: readonly ColorableCategory[],
): Map<string, CategoryColor> {
  const result = new Map<string, CategoryColor>();
  const taken = new Set<CategoryColorKey>();

  // Najpierw kolory wybrane ręcznie - one mają pierwszeństwo i rezerwują barwę.
  for (const category of categories) {
    if (category.color && isCategoryColorKey(category.color)) {
      const color = CATEGORY_COLORS.find((c) => c.key === category.color)!;
      result.set(category.id, color);
      taken.add(color.key);
    }
  }

  // Reszta dostaje pierwszy wolny kolor; gdy paleta się skończy - z nazwy.
  for (const category of categories) {
    if (result.has(category.id)) continue;
    const free = CATEGORY_COLORS.find((c) => !taken.has(c.key));
    const color = free ?? CATEGORY_COLORS[hashName(category.name) % CATEGORY_COLORS.length];
    result.set(category.id, color);
    if (free) taken.add(free.key);
  }

  return result;
}

// Klasa paska przy kafelku. Zajęcia bez rodzaju (starsze wpisy, zanim kategorie
// stały się wymagane) nie dostają paska - lepszy brak koloru niż kolor
// sugerujący przynależność do jakiejś grupy.
export function stripeClass(color: CategoryColor | null | undefined): string {
  return color ? `border-l-4 ${color.stripe}` : "";
}
