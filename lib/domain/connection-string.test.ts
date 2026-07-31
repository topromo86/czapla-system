import { describe, expect, it } from "vitest";
import { isDirectPostgresUrl, pickConnectionString } from "./connection-string";

const DIRECT = "postgresql://user:pass@db.example.com/klub?sslmode=require";
const ACCELERATE = "prisma+postgres://accelerate.prisma-data.net/?api_key=abc";

describe("isDirectPostgresUrl", () => {
  it("rozpoznaje adresy zrozumiałe dla node-postgres", () => {
    expect(isDirectPostgresUrl(DIRECT)).toBe(true);
    expect(isDirectPostgresUrl("postgres://u:p@host/db")).toBe(true);
  });

  it("odrzuca adres przez Accelerate i puste wartości", () => {
    expect(isDirectPostgresUrl(ACCELERATE)).toBe(false);
    expect(isDirectPostgresUrl(undefined)).toBe(false);
    expect(isDirectPostgresUrl("")).toBe(false);
  });
});

describe("pickConnectionString", () => {
  it("bierze DATABASE_URL, gdy jest w dobrym formacie", () => {
    expect(pickConnectionString({ DATABASE_URL: DIRECT })).toBe(DIRECT);
  });

  // Sedno: tak wygląda projekt na Vercelu z integracją Prisma Postgres.
  // Bez tego wyboru sterownik dostałby adres, którego nie umie otworzyć.
  it("pomija adres Accelerate i sięga po bezpośredni", () => {
    const url = pickConnectionString({
      DATABASE_URL: ACCELERATE,
      DATABASE_POSTGRES_URL: DIRECT,
      DATABASE_PRISMA_DATABASE_URL: ACCELERATE,
    });
    expect(url).toBe(DIRECT);
  });

  it("obsługuje nazewnictwo POSTGRES_URL", () => {
    expect(pickConnectionString({ POSTGRES_URL: DIRECT })).toBe(DIRECT);
  });

  it("gdy nic nie pasuje, oddaje DATABASE_URL dla czytelnego błędu", () => {
    expect(pickConnectionString({ DATABASE_URL: ACCELERATE })).toBe(ACCELERATE);
  });

  it("brak zmiennych nie wysypuje aplikacji", () => {
    expect(pickConnectionString({})).toBe("");
  });
});
