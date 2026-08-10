"use client";

import { useEffect, useState } from "react";

// Zegar kiosku w stylu starej tablicy przekładanej (split-flap) - takiej jak na
// dworcach i salach sportowych. Każda cyfra siedzi na własnej ciemnej płytce
// z poziomą szczeliną w połowie wysokości, dwukropek pulsuje co sekundę.
//
// Dlaczego tak, a nie efektowniejszy siedmiosegmentowy wyświetlacz: ten wygląd
// robi sam CSS, bez dociągania osobnego kroju pisma. Kiosk ma się podnieść na
// byle tablecie i wyglądać tak samo w jasnym i ciemnym motywie - płytki niosą
// własne tło, więc motyw ich nie rusza.
//
// Zegar tyka po stronie przeglądarki, bo strona odświeża się co 30 s i godzina
// z serwera potrafiłaby spóźniać się o pół minuty. Na ścianie to widać.
// Pierwszy render pokazuje wartość z serwera, żeby hydratacja nie zgłosiła
// rozjazdu.

const formatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});

// Płytka z cyfrą. Szczelina to zwykła linia w połowie wysokości - w prawdziwej
// tablicy właśnie tam rozdziela się przekładana karta.
function Flap({ char }: { char: string }) {
  return (
    <span className="relative inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3 py-1 text-neutral-50 ring-1 inset-shadow-sm ring-black/40 dark:bg-neutral-950">
      <span className="leading-none">{char}</span>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/60"
      />
    </span>
  );
}

export function KioskClock({ initial }: { initial: string }) {
  const [time, setTime] = useState(initial);
  // Dwukropek mruga jak w starym budziku - sekundy nie mieszczą się na tablicy,
  // a to jedyny znak, że zegar chodzi, a nie zawiesił się z resztą ekranu.
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const tick = () => {
      setTime(formatter.format(new Date()));
      setBlink(new Date().getSeconds() % 2 === 0);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p
      className="font-mono text-8xl leading-none font-bold tabular-nums"
      aria-label={`Godzina ${time}`}
      suppressHydrationWarning
    >
      <span className="inline-flex items-center gap-1.5">
        {time.split("").map((char, index) =>
          char === ":" ? (
            <span
              key={index}
              aria-hidden="true"
              className={`text-brand-red px-0.5 transition-opacity duration-200 ${
                blink ? "opacity-100" : "opacity-25"
              }`}
            >
              :
            </span>
          ) : (
            <Flap key={index} char={char} />
          ),
        )}
      </span>
    </p>
  );
}
