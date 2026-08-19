import type { ThemeChoice } from "@/lib/domain/theme";

// Stała i skrypt startowy motywu w osobnym module - główny layout jest
// komponentem serwerowym i nie może wołać funkcji z pliku "use client".

export const THEME_STORAGE_KEY = "czapla-theme";

// Skrypt wstrzykiwany do <head> i wykonywany PRZED pierwszym malowaniem.
// Bez tego strona mignęłaby na biało, zanim React zdąży się zamontować -
// przy motywie ciemnym w nocy to realnie razi w oczy.
//
// Kolejność: wybór zapisany przy KONCIE (jedzie za człowiekiem na każde
// urządzenie), potem wybór zapamiętany w tej przeglądarce, a na końcu
// ustawienie systemu. Konto jest wyżej, bo pamięć przeglądarki zna tylko ten
// jeden sprzęt i ginie przy czyszczeniu danych albo zmianie adresu strony.
export function themeInitScript(accountTheme: ThemeChoice | null): string {
  return `
(function () {
  var account = ${accountTheme ? `'${accountTheme}'` : "null"};
  var choice = account;
  try {
    if (choice === null) choice = localStorage.getItem('${THEME_STORAGE_KEY}');
    // Konto ma pierwszeństwo, więc zrównujemy z nim pamięć przeglądarki -
    // inaczej przełącznik na tej karcie startowałby ze starą wartością.
    if (account !== null) localStorage.setItem('${THEME_STORAGE_KEY}', account);
  } catch (e) {
    /* Prywatny tryb przeglądarki blokuje localStorage - zostaje sam wybór konta. */
  }
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = choice === 'dark' || (choice !== 'light' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
})();
`;
}
