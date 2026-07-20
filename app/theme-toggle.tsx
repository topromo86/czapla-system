"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_STORAGE_KEY = "czapla-theme";

// Skrypt wstrzykiwany do <head> i wykonywany PRZED pierwszym malowaniem.
// Bez tego strona mignęłaby na biało, zanim React zdąży się zamontować -
// przy motywie ciemnym w nocy to realnie razi w oczy.
//
// Kolejność: zapisany wybór użytkownika, a gdy go nie ma - ustawienie
// systemu. Zapisany wybór wygrywa z systemem, bo to świadoma decyzja.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored === null && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    /* Prywatny tryb przeglądarki blokuje localStorage - trudno, zostaje jasny. */
  }
})();
`;

function isDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  // Startujemy z `null`, bo motyw znamy dopiero po stronie przeglądarki.
  // Renderowanie ikony przed hydratacją dawałoby niezgodność serwer-klient.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(isDarkNow());
  }, []);

  function toggle() {
    const next = !isDarkNow();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* Bez zapisu wybór zniknie po odświeżeniu, ale sam przełącznik działa. */
    }
    setDark(next);
  }

  const label = dark ? "Włącz tryb jasny" : "Włącz tryb ciemny";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="border-line bg-surface-2 text-text hover:text-brand-red flex size-9 shrink-0 items-center justify-center rounded-md border"
    >
      {/* Do czasu hydratacji rezerwujemy miejsce, żeby nagłówek nie skakał. */}
      {dark === null ? (
        <span className="size-4" aria-hidden />
      ) : dark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
