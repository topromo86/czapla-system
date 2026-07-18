// Formatowanie pieniędzy i dat - CLAUDE.md: Intl.NumberFormat('pl-PL'),
// strefa Europe/Warsaw, ceny w złotych brutto.

const moneyFormatter = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  dateStyle: "medium",
});

export function formatMoney(grosze: number): string {
  return moneyFormatter.format(grosze / 100);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}
