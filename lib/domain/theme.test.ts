import { describe, expect, it } from "vitest";
import { readThemeChoice } from "./theme";

describe("readThemeChoice", () => {
  it("przepuszcza dwa dozwolone motywy", () => {
    expect(readThemeChoice("dark")).toBe("dark");
    expect(readThemeChoice("light")).toBe("light");
  });

  it("wszystko inne to brak wyboru, czyli ustawienie systemu", () => {
    expect(readThemeChoice(null)).toBeNull();
    expect(readThemeChoice(undefined)).toBeNull();
    expect(readThemeChoice("")).toBeNull();
    expect(readThemeChoice("ciemny")).toBeNull();
    expect(readThemeChoice("DARK")).toBeNull();
    expect(readThemeChoice(1)).toBeNull();
  });
});
