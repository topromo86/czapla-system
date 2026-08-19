// Adres powrotny przekazywany w formularzu albo w query stringu ("wróć tam,
// skąd przyszedłeś po zalogowaniu / po zapisie").
//
// Wartość pochodzi od użytkownika, więc jest wpuszczana wyłącznie wtedy, gdy
// jest ścieżką wewnątrz tej aplikacji. Bez tego "?powrot=https://cudza.strona"
// zamieniłby ekran logowania w przekierowanie na dowolny adres - klasyczny
// open redirect, chętnie używany w phishingu ("zaloguj się w klubie" prowadzi
// na podrobiony ekran).
//
// Odrzucamy też "//host" i "/\host": przeglądarka czyta je jako adres
// zewnętrzny, mimo że zaczynają się od ukośnika.

export function isSafeReturnPath(value: unknown, allowedPrefixes: readonly string[]): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return allowedPrefixes.some(
    (prefix) =>
      value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`),
  );
}

export function safeReturnPath(
  value: unknown,
  allowedPrefixes: readonly string[],
  fallback: string,
): string {
  return isSafeReturnPath(value, allowedPrefixes) ? (value as string) : fallback;
}
