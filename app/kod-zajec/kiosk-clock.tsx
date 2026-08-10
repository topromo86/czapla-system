"use client";

import { useEffect, useState } from "react";

// Zegar kiosku. Sama strona odświeża się co 30 s, więc godzina brana z serwera
// potrafiłaby spóźniać się o pół minuty - na zegarze wiszącym na ścianie to
// widać. Dlatego tyka po stronie przeglądarki, co sekundę.
//
// Pierwszy render pokazuje wartość z serwera, żeby hydratacja nie zgłosiła
// rozjazdu; dopiero potem zegar zaczyna chodzić.
const formatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});

export function KioskClock({ initial }: { initial: string }) {
  const [time, setTime] = useState(initial);

  useEffect(() => {
    const tick = () => setTime(formatter.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    // tabular-nums: cyfry o równej szerokości, inaczej zegar drga przy każdej
    // zmianie minuty.
    <p
      className="text-text font-display text-5xl leading-none tabular-nums"
      suppressHydrationWarning
    >
      {time}
    </p>
  );
}
