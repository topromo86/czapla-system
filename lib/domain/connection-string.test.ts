import { describe, expect, it } from "vitest";
import { hardenSslMode, isDirectPostgresUrl, pickConnectionString } from "./connection-string";

const DIRECT = "postgresql://user:pass@db.example.com/klub?sslmode=require";
const DIRECT_HARDENED = "postgresql://user:pass@db.example.com/klub?sslmode=verify-full";
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

describe("hardenSslMode", () => {
  // Bez tego aktualizacja pg do wersji 9 po cichu wyłączyłaby sprawdzanie
  // certyfikatu - połączenie z bazą klubu byłoby tylko szyfrowane.
  it("zapisuje wprost sprawdzanie certyfikatu", () => {
    expect(hardenSslMode(DIRECT)).toBe(DIRECT_HARDENED);
  });

  it("nie rusza adresu bez sslmode=require", () => {
    const bezSsl = "postgresql://user:pass@db.example.com/klub";
    expect(hardenSslMode(bezSsl)).toBe(bezSsl);
    expect(hardenSslMode(DIRECT_HARDENED)).toBe(DIRECT_HARDENED);
  });

  it("nie osłabia trybu wybranego świadomie", () => {
    const disable = "postgresql://user:pass@localhost/klub?sslmode=disable";
    expect(hardenSslMode(disable)).toBe(disable);
  });
});

describe("pickConnectionString", () => {
  it("bierze DATABASE_URL, gdy jest w dobrym formacie", () => {
    expect(pickConnectionString({ DATABASE_URL: DIRECT })).toBe(DIRECT_HARDENED);
  });

  // Sedno: tak wygląda projekt na Vercelu z integracją Prisma Postgres.
  // Bez tego wyboru sterownik dostałby adres, którego nie umie otworzyć.
  it("pomija adres Accelerate i sięga po bezpośredni", () => {
    const url = pickConnectionString({
      DATABASE_URL: ACCELERATE,
      DATABASE_POSTGRES_URL: DIRECT,
      DATABASE_PRISMA_DATABASE_URL: ACCELERATE,
    });
    expect(url).toBe(DIRECT_HARDENED);
  });

  it("obsługuje nazewnictwo POSTGRES_URL", () => {
    expect(pickConnectionString({ POSTGRES_URL: DIRECT })).toBe(DIRECT_HARDENED);
  });

  // Świadomie wyłączone SSL zostaje wyłączone - podnoszenie go na siłę
  // zerwałoby połączenie z bazą, która szyfrowania nie oferuje.
  it("nie podnosi trybu SSL wyłączonego wprost", () => {
    const bezSsl = "postgres://user:pass@db.example.com:5432/klub?sslmode=disable";
    expect(pickConnectionString({ DATABASE_URL: bezSsl })).toBe(bezSsl);
  });

  it("gdy nic nie pasuje, oddaje DATABASE_URL dla czytelnego błędu", () => {
    expect(pickConnectionString({ DATABASE_URL: ACCELERATE })).toBe(ACCELERATE);
  });

  it("brak zmiennych nie wysypuje aplikacji", () => {
    expect(pickConnectionString({})).toBe("");
  });
});
