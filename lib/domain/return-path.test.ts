import { describe, expect, it } from "vitest";
import { isSafeReturnPath, safeReturnPath } from "./return-path";

const PREFIXES = ["/app", "/zapis"] as const;

describe("isSafeReturnPath", () => {
  it("wpuszcza ścieżki z dozwolonych gałęzi", () => {
    expect(isSafeReturnPath("/app", PREFIXES)).toBe(true);
    expect(isSafeReturnPath("/app/pulpit", PREFIXES)).toBe(true);
    expect(isSafeReturnPath("/app?tydzien=2026-09-07", PREFIXES)).toBe(true);
    expect(isSafeReturnPath("/zapis/ses1", PREFIXES)).toBe(true);
  });

  it("odrzuca adresy zewnętrzne", () => {
    expect(isSafeReturnPath("https://cudza.strona/app", PREFIXES)).toBe(false);
    expect(isSafeReturnPath("//cudza.strona", PREFIXES)).toBe(false);
    expect(isSafeReturnPath("/\\cudza.strona", PREFIXES)).toBe(false);
  });

  it("odrzuca ścieżki spoza dozwolonych gałęzi", () => {
    expect(isSafeReturnPath("/admin/pulpit", PREFIXES)).toBe(false);
    expect(isSafeReturnPath("/api/cron/generate-sessions", PREFIXES)).toBe(false);
  });

  it("nie daje się nabrać na prefiks doklejony do innej nazwy", () => {
    expect(isSafeReturnPath("/appartament", PREFIXES)).toBe(false);
    expect(isSafeReturnPath("/zapisywanie", PREFIXES)).toBe(false);
  });

  it("odrzuca wartości, które nie są tekstem", () => {
    expect(isSafeReturnPath(null, PREFIXES)).toBe(false);
    expect(isSafeReturnPath(undefined, PREFIXES)).toBe(false);
    expect(isSafeReturnPath(42, PREFIXES)).toBe(false);
    expect(isSafeReturnPath("", PREFIXES)).toBe(false);
  });
});

describe("safeReturnPath", () => {
  it("oddaje wartość albo awaryjną ścieżkę", () => {
    expect(safeReturnPath("/app/pulpit", PREFIXES, "/app")).toBe("/app/pulpit");
    expect(safeReturnPath("https://cudza.strona", PREFIXES, "/app")).toBe("/app");
  });
});
