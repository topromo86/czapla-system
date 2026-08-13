import { describe, expect, it } from "vitest";
import { formatPolishPhone, parsePolishPhone } from "./phone";

function phoneOf(raw: string): string | null {
  const result = parsePolishPhone(raw);
  return "phone" in result ? result.phone : null;
}

function errorOf(raw: string): string | null {
  const result = parsePolishPhone(raw);
  return "error" in result ? result.error : null;
}

describe("parsePolishPhone", () => {
  // Ludzie wpisują numer na kilkanaście sposobów, a w bazie ma być jeden.
  it("sprowadza typowe zapisy do jednej postaci", () => {
    expect(phoneOf("500600700")).toBe("+48500600700");
    expect(phoneOf("+48500600700")).toBe("+48500600700");
    expect(phoneOf("+48 500 600 700")).toBe("+48500600700");
    expect(phoneOf("500-600-700")).toBe("+48500600700");
    expect(phoneOf("(500) 600 700")).toBe("+48500600700");
  });

  it("rozumie zapis z zerami wiodącymi", () => {
    expect(phoneOf("0048500600700")).toBe("+48500600700");
    expect(phoneOf("48500600700")).toBe("+48500600700");
    expect(phoneOf("0500600700")).toBe("+48500600700");
  });

  it("odrzuca pusty numer", () => {
    expect(errorOf("")).toBe("EMPTY");
    expect(errorOf("   ")).toBe("EMPTY");
  });

  // Klub dzwoni z Polski i tylko takie numery przyjmuje - obcy kierunkowy ma
  // dostać własny komunikat, a nie "zły format".
  it("odrzuca numer zagraniczny z własnym powodem", () => {
    expect(errorOf("+49123456789")).toBe("FOREIGN_PREFIX");
    expect(errorOf("+380501234567")).toBe("FOREIGN_PREFIX");
  });

  it("odrzuca złą długość", () => {
    expect(errorOf("50060070")).toBe("WRONG_LENGTH");
    expect(errorOf("5006007001")).toBe("WRONG_LENGTH");
    expect(errorOf("+48500")).toBe("WRONG_LENGTH");
  });

  it("odrzuca litery", () => {
    expect(errorOf("pięćset")).toBe("WRONG_LENGTH");
    expect(errorOf("500600ABC")).toBe("WRONG_LENGTH");
  });
});

describe("formatPolishPhone", () => {
  it("rozdziela numer do czytania", () => {
    expect(formatPolishPhone("+48500600700")).toBe("+48 500 600 700");
  });

  it("nietypowy numer zostawia bez zmian", () => {
    expect(formatPolishPhone("+441234")).toBe("+441234");
  });
});
