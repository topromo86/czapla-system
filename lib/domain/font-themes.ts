// Zestawy czcionek do wyboru przez admina (obowiązują całą aplikację). Każdy
// zestaw to kombinacja fontu nagłówków (display), tekstu (sans) i technicznego
// (mono). Przełączanie dzieje się przez atrybut data-font na <html> - patrz
// app/layout.tsx i globals.css. displayVar używamy TYLKO do podglądu na ekranie
// wyboru (renderuje próbkę konkretnym fontem niezależnie od aktywnego zestawu).

export type FontThemeId = "boxing" | "modern" | "classic" | "minimal";

export type FontTheme = {
  id: FontThemeId;
  label: string;
  description: string;
  displayVar: string; // zmienna CSS fontu nagłówków (do podglądu)
  sample: string; // przykładowy napis w podglądzie
};

export const FONT_THEMES: FontTheme[] = [
  {
    id: "boxing",
    label: "Bokserski",
    description: "Mocne, kondensowane nagłówki (Anton) + Archivo. Domyślny, sportowy charakter.",
    displayVar: "var(--font-anton)",
    sample: "CZAPLA BOXING",
  },
  {
    id: "modern",
    label: "Nowoczesny",
    description: "Kondensowany Oswald w nagłówkach i czysty Inter w tekście.",
    displayVar: "var(--font-oswald)",
    sample: "Trening & Forma",
  },
  {
    id: "classic",
    label: "Elegancki",
    description: "Szeryfowe nagłówki Playfair Display - bardziej stonowany, klubowy sznyt.",
    displayVar: "var(--font-playfair)",
    sample: "Klub Sportowy",
  },
  {
    id: "minimal",
    label: "Minimalny",
    description: "Jednolity Inter bez ozdób - maksymalna czytelność.",
    displayVar: "var(--font-inter)",
    sample: "Prosto i czysto",
  },
];

export const DEFAULT_FONT_THEME: FontThemeId = "boxing";

export function isFontThemeId(value: string): value is FontThemeId {
  return FONT_THEMES.some((t) => t.id === value);
}

// Normalizuje wartość z bazy do znanego id (fallback na domyślny).
export function resolveFontTheme(value: string | null | undefined): FontThemeId {
  return value && isFontThemeId(value) ? value : DEFAULT_FONT_THEME;
}
