import { describe, expect, it } from "vitest";
import { themeInitScript, THEME_STORAGE_KEY } from "./theme-init";

// Skrypt startowy motywu wykonuje się przed pierwszym malowaniem, więc nie da
// się go sprawdzić w Reakcie - testujemy jego działanie, uruchamiając go na
// podstawionym dokumencie i pamięci przeglądarki.
function uruchom(
  script: string,
  { zapisane, systemCiemny }: { zapisane: string | null; systemCiemny: boolean },
) {
  const klasy = new Set<string>();
  const pamiec = new Map<string, string>();
  if (zapisane !== null) pamiec.set(THEME_STORAGE_KEY, zapisane);

  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, on: boolean) => (on ? klasy.add(name) : klasy.delete(name)),
      },
    },
  };
  const localStorage = {
    getItem: (k: string) => pamiec.get(k) ?? null,
    setItem: (k: string, v: string) => pamiec.set(k, v),
  };
  const window = { matchMedia: () => ({ matches: systemCiemny }) };

  new Function("document", "localStorage", "window", script)(document, localStorage, window);

  return { ciemny: klasy.has("dark"), zapamietane: pamiec.get(THEME_STORAGE_KEY) ?? null };
}

describe("themeInitScript", () => {
  it("wybór zapisany przy koncie wygrywa z pamięcią przeglądarki", () => {
    const wynik = uruchom(themeInitScript("dark"), { zapisane: "light", systemCiemny: false });
    expect(wynik.ciemny).toBe(true);
    // i od razu równa pamięć przeglądarki, żeby przełącznik nie startował ze starą wartością
    expect(wynik.zapamietane).toBe("dark");
  });

  it("konto na jasny wygrywa z ciemnym ustawieniem systemu", () => {
    expect(uruchom(themeInitScript("light"), { zapisane: null, systemCiemny: true }).ciemny).toBe(
      false,
    );
  });

  it("bez konta decyduje pamięć tej przeglądarki", () => {
    expect(uruchom(themeInitScript(null), { zapisane: "dark", systemCiemny: false }).ciemny).toBe(
      true,
    );
    expect(uruchom(themeInitScript(null), { zapisane: "light", systemCiemny: true }).ciemny).toBe(
      false,
    );
  });

  it("bez konta i bez zapisu idzie za systemem", () => {
    expect(uruchom(themeInitScript(null), { zapisane: null, systemCiemny: true }).ciemny).toBe(
      true,
    );
    expect(uruchom(themeInitScript(null), { zapisane: null, systemCiemny: false }).ciemny).toBe(
      false,
    );
  });
});
