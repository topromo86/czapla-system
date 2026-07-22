import type { MemberLevel } from "@/app/generated/prisma/client";

export type LevelInfo = {
  value: MemberLevel;
  label: string;
  // Kolor odznaki w legendzie. Stały hex (kolor "pasa"), niezależny od motywu
  // jasny/ciemny - dlatego nie token CSS. Biały renderujemy z obwódką, żeby był
  // widoczny na jasnym tle.
  color: string;
  // Opis ramowy - klub może dopasować do własnego programu szkolenia.
  description: string;
};

// Jedno źródło prawdy dla poziomów: kolejność (progresja od startu do
// zaawansowanego), etykiety, kolory i opisy. Używane w legendzie, na karcie
// klienta (wybór poziomu) i w Postępach. Kolejność w tablicy = kolejność awansu.
export const MEMBER_LEVELS: readonly LevelInfo[] = [
  {
    value: "WHITE",
    label: "Biały",
    color: "#e9ebee",
    description: "Start w klubie - podstawy postawy, poruszania się i prostych ciosów.",
  },
  {
    value: "YELLOW",
    label: "Żółty",
    color: "#f2c200",
    description: "Opanowane podstawy - pewna postawa i pierwsze kombinacje, praca na tarczach.",
  },
  {
    value: "ORANGE",
    label: "Pomarańczowy",
    color: "#f97316",
    description: "Poziom średni - płynne kombinacje, obrona i praca na dystansie.",
  },
  {
    value: "GREEN",
    label: "Zielony",
    color: "#16a34a",
    description: "Poziom zaawansowany - swobodny sparing, taktyka i pełen zakres techniki.",
  },
];

// Mapa value -> etykieta, wygodna tam, gdzie potrzebna jest sama nazwa.
export const MEMBER_LEVEL_LABEL = Object.fromEntries(
  MEMBER_LEVELS.map((l) => [l.value, l.label]),
) as Record<MemberLevel, string>;
