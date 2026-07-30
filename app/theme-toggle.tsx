"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// Zdarzenie, którym sam przełącznik ogłasza zmianę motywu - useSyncExternalStore
// nasłuchuje go i przerysowuje ikonę bez setState w efekcie.
const THEME_CHANGE_EVENT = "czapla-theme-change";

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

// Motyw to zewnętrzny stan (klasa na <html>), więc czytamy go przez
// useSyncExternalStore, a nie przez setState w efekcie. Źródłem zmian jest sam
// przełącznik (zdarzenie THEME_CHANGE_EVENT) oraz preferencja systemu.
function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle() {
  // getServerSnapshot = false: serwer i pierwszy render po stronie klienta
  // zakładają jasny (skrypt w <head> ustawia właściwą klasę przed malowaniem, a
  // useSyncExternalStore po hydratacji odczyta realny stan). Brak niezgodności.
  const dark = useSyncExternalStore(
    subscribeTheme,
    isDarkNow,
    () => false,
  );

  function toggle() {
    const next = !isDarkNow();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* Bez zapisu wybór zniknie po odświeżeniu, ale sam przełącznik działa. */
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
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
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
