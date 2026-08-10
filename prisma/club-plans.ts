// Cennik Czapla Boxing - jedyne miejsce, w którym żyją rodzaje karnetów klubu.
// Korzysta z niego i seed, i skrypt wgrywający cennik na czystą bazę, żeby
// dane demonstracyjne nie miały jak wrócić tylnymi drzwiami.
//
// "3× w tygodniu" zamieniamy na 12 wejść w 30 dni, "2× w tygodniu" na 8 -
// model karnetu liczy wejścia, nie dni tygodnia. Cztery tygodnie razy trzy daje
// dwanaście; to jest ta sama umowa z klientem, tylko wyrażona liczbą wejść.
// Właściciel może to zmienić na ekranie „Rodzaje karnetów" bez programisty.

export type ClubPlan = {
  name: string;
  priceGross: number;
  entriesPerMonth: number | null;
  durationDays: number;
  forMinors: boolean;
};

export const CLUB_PLANS: readonly ClubPlan[] = [
  {
    name: "Dorośli 3× w tygodniu",
    priceGross: 30000,
    entriesPerMonth: 12,
    durationDays: 30,
    forMinors: false,
  },
  {
    name: "Dorośli 2× w tygodniu",
    priceGross: 25000,
    entriesPerMonth: 8,
    durationDays: 30,
    forMinors: false,
  },

  {
    name: "Kids/Junior 3× w tygodniu",
    priceGross: 25000,
    entriesPerMonth: 12,
    durationDays: 30,
    forMinors: true,
  },
  {
    name: "Kids/Junior 2× w tygodniu",
    priceGross: 20000,
    entriesPerMonth: 8,
    durationDays: 30,
    forMinors: true,
  },

  // Treningi indywidualne rozliczane wejściami, ważne 30 dni od zakupu.
  {
    name: "Trening indywidualny 1×",
    priceGross: 15000,
    entriesPerMonth: 1,
    durationDays: 30,
    forMinors: false,
  },
  {
    name: "Trening indywidualny 4×",
    priceGross: 56000,
    entriesPerMonth: 4,
    durationDays: 30,
    forMinors: false,
  },
  {
    name: "Trening indywidualny 8×",
    priceGross: 104000,
    entriesPerMonth: 8,
    durationDays: 30,
    forMinors: false,
  },
];
