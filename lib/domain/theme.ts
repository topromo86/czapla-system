// Motyw interfejsu: jasny albo ciemny.
//
// Wybór trzymamy przy koncie, nie tylko w przeglądarce - pamięć przeglądarki
// jest osobna dla każdego urządzenia i znika po zmianie adresu strony albo
// wyczyszczeniu danych. Właściciel, który wieczorem przełączył na ciemny na
// telefonie, ma go zastać rano na komputerze w biurze.

export type ThemeChoice = "dark" | "light";

export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light"];

// Wartość z bazy albo z formularza. Cokolwiek innego (null, literówka, stary
// zapis) znaczy "brak wyboru" - wtedy decyduje ustawienie systemu.
export function readThemeChoice(value: unknown): ThemeChoice | null {
  return value === "dark" || value === "light" ? value : null;
}
