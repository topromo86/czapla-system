"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import type { ThemeChoice } from "@/lib/domain/theme";
import { saveThemeAction } from "./theme-action";
import { THEME_STORAGE_KEY } from "./theme-init";

// Zdarzenie, którym sam przełącznik ogłasza zmianę motywu - useSyncExternalStore
// nasłuchuje go i przerysowuje ikonę bez setState w efekcie.
const THEME_CHANGE_EVENT = "czapla-theme-change";

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
  const dark = useSyncExternalStore(subscribeTheme, isDarkNow, () => false);

  function toggle() {
    const next = !isDarkNow();
    const choice: ThemeChoice = next ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      /* Bez zapisu wybór zniknie po odświeżeniu, ale sam przełącznik działa. */
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));

    // Zapis przy koncie idzie w tle - ekran przełącza się od razu, a nieudana
    // sieć nie ma prawa zablokować kliknięcia w przycisk. Dla gościa akcja
    // po cichu nic nie robi.
    void saveThemeAction(choice).catch(() => {});
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
