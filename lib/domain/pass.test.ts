import { describe, expect, it } from "vitest";
import { classifyPassStatus } from "./pass";

const DAY = 86_400_000;

describe("classifyPassStatus", () => {
  const now = new Date("2026-07-18T10:00:00Z");

  it("NONE gdy brak karnetu", () => {
    expect(classifyPassStatus(null, now)).toBe("NONE");
  });

  it("ACTIVE gdy do końca zostało więcej niż próg (7 dni)", () => {
    const pass = { endsAt: new Date(now.getTime() + 10 * DAY) };
    expect(classifyPassStatus(pass, now)).toBe("ACTIVE");
  });

  it("EXPIRING_SOON dokładnie na granicy 7 dni", () => {
    const pass = { endsAt: new Date(now.getTime() + 7 * DAY) };
    expect(classifyPassStatus(pass, now)).toBe("EXPIRING_SOON");
  });

  it("EXPIRING_SOON tuż przed granicą", () => {
    const pass = { endsAt: new Date(now.getTime() + 6 * DAY) };
    expect(classifyPassStatus(pass, now)).toBe("EXPIRING_SOON");
  });

  it("EXPIRING_SOON gdy karnet już minął (nadal ACTIVE w bazie)", () => {
    const pass = { endsAt: new Date(now.getTime() - DAY) };
    expect(classifyPassStatus(pass, now)).toBe("EXPIRING_SOON");
  });

  it("respektuje własny próg dni", () => {
    const pass = { endsAt: new Date(now.getTime() + 3 * DAY) };
    expect(classifyPassStatus(pass, now, 2)).toBe("ACTIVE");
    expect(classifyPassStatus(pass, now, 5)).toBe("EXPIRING_SOON");
  });
});
