// Skala kolorów dla pasków postępu w Rankingu trenerów: czerwień (nisko) →
// pomarańcz → żółć → limonka → jadeit (wysoko). Progi opisane słownie w
// panelu "Wyjaśnienie statystyk" (app/admin/ranking/page.tsx): <40% nisko,
// 40-69% średnio, >=70% wysoko - muszą się zgadzać z tym, co widać tutaj.
//
// Sześć przystanków, nie trzy. Interpolacja RGB wprost z bursztynu (#c9760a)
// do jadeitu daje w połowie ciemną oliwkę (#748033) - brąz to po prostu
// przyciemniony żółty, więc rampa MUSI trzymać wysoką jasność w środku
// skali, przechodząc przez jasny pomarańcz i czystą żółć. Skrajne kolory
// zostają zgodne z tokenami --red i --jade (app/globals.css); środkowe są
// jaśniejsze i bardziej nasycone niż token --amber, właśnie po to, żeby
// nigdzie nie zrobiło się błotniście. Osobny przystanek na zieleni (0.8)
// jest po to, żeby odcinek limonka→jadeit - czyli wyniki 75-100%, najczęściej
// oglądany zakres - nie odsycał się w środku, co robi każde mieszanie RGB
// między dwiema mocno nasyconymi barwami.
const STOPS = [
  { r: 0xc8, g: 0x39, b: 0x2f }, // 0.0 - czerwień (--red)
  { r: 0xe0, g: 0x6c, b: 0x1a }, // 0.2 - pomarańcz
  { r: 0xed, g: 0xb5, b: 0x20 }, // 0.4 - żółć
  { r: 0xb5, g: 0xd1, b: 0x39 }, // 0.6 - limonka
  { r: 0x5c, g: 0xb5, b: 0x48 }, // 0.8 - zieleń
  { r: 0x1f, g: 0x8a, b: 0x5c }, // 1.0 - jadeit (--jade)
] as const;

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

// ratio: 0..1. Wartości spoza zakresu są przycinane.
export function colorForRatio(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  const segments = STOPS.length - 1;
  // Ostatni przystanek trafia dokładnie w t=1, bez wyjścia poza tablicę.
  const index = Math.min(segments - 1, Math.floor(t * segments));
  const localT = t * segments - index;
  const from = STOPS[index];
  const to = STOPS[index + 1];
  return `#${toHex(lerp(from.r, to.r, localT))}${toHex(lerp(from.g, to.g, localT))}${toHex(lerp(from.b, to.b, localT))}`;
}
