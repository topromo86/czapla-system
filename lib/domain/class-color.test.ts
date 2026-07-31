import { describe, expect, it } from "vitest";
import {
  assignCategoryColors,
  CATEGORY_COLORS,
  isCategoryColorKey,
  stripeClass,
  type ColorableCategory,
} from "./class-color";

// Realne rodzaje klubu - na nich zależy nam najbardziej.
const KLUB: ColorableCategory[] = [
  { id: "1", name: "Kids Boxing" },
  { id: "2", name: "Boks Junior" },
  { id: "3", name: "Women Boxing" },
  { id: "4", name: "Gentleman Boxing" },
  { id: "5", name: "Treningi Personalne" },
];

describe("assignCategoryColors", () => {
  // Sedno sprawy: "Kids Boxing" i "Boks Junior" muszą się różnić kolorem,
  // bo to dwie grupy młodzieżowe, które najłatwiej pomylić.
  it("każdy rodzaj dostaje inny kolor", () => {
    const colors = assignCategoryColors(KLUB);
    const keys = [...colors.values()].map((c) => c.key);
    expect(new Set(keys).size).toBe(KLUB.length);
  });

  it("kolor wybrany ręcznie ma pierwszeństwo", () => {
    const colors = assignCategoryColors([
      { id: "1", name: "Kids Boxing", color: "rose" },
      { id: "2", name: "Boks Junior" },
    ]);
    expect(colors.get("1")?.key).toBe("rose");
  });

  // Inaczej rodzaj bez ustawionego koloru mógłby "ukraść" barwę wybraną ręcznie.
  it("kolor zajęty ręcznie nie trafia do innego rodzaju", () => {
    const colors = assignCategoryColors([
      { id: "1", name: "A" },
      { id: "2", name: "B", color: CATEGORY_COLORS[0].key },
    ]);
    expect(colors.get("2")?.key).toBe(CATEGORY_COLORS[0].key);
    expect(colors.get("1")?.key).not.toBe(CATEGORY_COLORS[0].key);
  });

  it("ten sam zestaw rodzajów daje zawsze te same kolory", () => {
    const a = assignCategoryColors(KLUB);
    const b = assignCategoryColors(KLUB);
    for (const c of KLUB) expect(a.get(c.id)?.key).toBe(b.get(c.id)?.key);
  });

  // Realny klub ma 7 rodzajów (4 własne + 3 z konfiguracji startowej). Przy
  // 6 kolorach dwa z nich dostawały tę samą barwę i "kids" zlewał się
  // z "Gentleman" na grafiku - paleta musi mieć zapas.
  it("paleta mieści realny zestaw rodzajów klubu bez powtórek", () => {
    const siedem: ColorableCategory[] = [
      { id: "1", name: "Boks Grupowy" },
      { id: "2", name: "Kids Boxing" },
      { id: "3", name: "Boks Grupowy Junior" },
      { id: "4", name: "Boks Junior" },
      { id: "5", name: "Treningi Personalne" },
      { id: "6", name: "Women Boxing" },
      { id: "7", name: "Gentleman Boxing" },
    ];
    const colors = assignCategoryColors(siedem);
    expect(new Set([...colors.values()].map((c) => c.key)).size).toBe(siedem.length);
  });

  it("pełna paleta rozdaje same różne kolory", () => {
    const maks: ColorableCategory[] = CATEGORY_COLORS.map((_, i) => ({
      id: String(i),
      name: `Rodzaj ${i}`,
    }));
    const colors = assignCategoryColors(maks);
    expect(new Set([...colors.values()].map((c) => c.key)).size).toBe(CATEGORY_COLORS.length);
  });

  it("każdy rodzaj dostaje jakiś kolor, także ponad paletę", () => {
    const many: ColorableCategory[] = Array.from(
      { length: CATEGORY_COLORS.length + 3 },
      (_, i) => ({
        id: String(i),
        name: `Rodzaj ${i}`,
      }),
    );
    const colors = assignCategoryColors(many);
    expect(colors.size).toBe(many.length);
    for (const c of many) {
      expect(CATEGORY_COLORS.map((x) => x.key)).toContain(colors.get(c.id)!.key);
    }
  });

  // Podrobiony/stary wpis w bazie nie może wywrócić grafiku.
  it("nieznany klucz koloru schodzi do przydziału automatycznego", () => {
    const colors = assignCategoryColors([{ id: "1", name: "Kids Boxing", color: "burgund" }]);
    expect(CATEGORY_COLORS.map((c) => c.key)).toContain(colors.get("1")!.key);
  });

  it("pusta lista nie wybucha", () => {
    expect(assignCategoryColors([]).size).toBe(0);
  });
});

describe("isCategoryColorKey", () => {
  it("rozpoznaje klucze z palety", () => {
    expect(isCategoryColorKey("sky")).toBe(true);
    expect(isCategoryColorKey("zloty")).toBe(false);
  });
});

describe("stripeClass", () => {
  it("daje klasę paska dla koloru", () => {
    const stripe = stripeClass(CATEGORY_COLORS[0]);
    expect(stripe).toContain("border-l-4");
    expect(stripe).toContain(CATEGORY_COLORS[0].stripe);
  });

  it("brak rodzaju = brak paska", () => {
    expect(stripeClass(null)).toBe("");
    expect(stripeClass(undefined)).toBe("");
  });
});
