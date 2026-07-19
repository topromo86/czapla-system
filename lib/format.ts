// Formatowanie pieniędzy i dat - CLAUDE.md: Intl.NumberFormat('pl-PL'),
// strefa Europe/Warsaw, ceny w złotych brutto.

const moneyFormatter = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  dateStyle: "medium",
});
const timeFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});
const dayTimeFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMoney(grosze: number): string {
  return moneyFormatter.format(grosze / 100);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

// "wt, 21 lip, 18:00" - do list terminów, gdzie sam dzień tygodnia i godzina
// mówią więcej niż pełna data.
export function formatDayTime(date: Date): string {
  return dayTimeFormatter.format(date);
}

// Wartość dla <input type="date"> w czasie klubu, nie w UTC serwera.
export function toDateInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

// Wartość dla <input type="time"> w czasie klubu.
export function toTimeInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
