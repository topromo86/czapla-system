import { describe, expect, it } from "vitest";
import { MEMBER_LEVELS, MEMBER_LEVEL_LABEL } from "./member-level";

// Wartości enuma MemberLevel ze schematu. Jeśli ktoś doda poziom w schema.prisma,
// ten test przypomni, że trzeba go opisać w legendzie (a nie zostawić bez opisu).
const SCHEMA_LEVELS = ["WHITE", "YELLOW", "ORANGE", "GREEN"] as const;

describe("member-level", () => {
  it("legenda pokrywa wszystkie poziomy ze schematu", () => {
    expect(MEMBER_LEVELS.map((l) => l.value)).toEqual([...SCHEMA_LEVELS]);
  });

  it("każdy poziom ma etykietę, kolor i opis", () => {
    for (const level of MEMBER_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(level.description.length).toBeGreaterThan(0);
    }
  });

  it("mapa etykiet zgadza się z listą", () => {
    expect(MEMBER_LEVEL_LABEL.WHITE).toBe("Biały");
    expect(MEMBER_LEVEL_LABEL.GREEN).toBe("Zielony");
  });
});
