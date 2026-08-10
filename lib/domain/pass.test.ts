import { describe, expect, it } from "vitest";
import { classifyPassStatus, pickPassForSession, type PassForSession } from "./pass";

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

describe("pickPassForSession", () => {
  const pass = (over: Partial<PassForSession> & { id: string }): PassForSession => ({
    endsAt: new Date("2026-09-01"),
    entriesLeft: 10,
    forIndividual: false,
    ...over,
  });

  // Sedno naprawy: klient ma karnet grupowy i indywidualny naraz.
  it("trening indywidualny bierze z karnetu indywidualnego", () => {
    const grupowy = pass({ id: "grupowy" });
    const indywidualny = pass({ id: "indywidualny", forIndividual: true });
    expect(pickPassForSession([grupowy, indywidualny], "INDIVIDUAL")?.id).toBe("indywidualny");
  });

  it("zajęcia grupowe biorą z karnetu grupowego", () => {
    const grupowy = pass({ id: "grupowy" });
    const indywidualny = pass({ id: "indywidualny", forIndividual: true });
    expect(pickPassForSession([grupowy, indywidualny], "GROUP")?.id).toBe("grupowy");
  });

  // Data końca nie może decydować ponad rodzajem - to był stary błąd.
  it("rodzaj wygrywa z datą końca", () => {
    const grupowyPozniejszy = pass({ id: "grupowy", endsAt: new Date("2026-12-31") });
    const indywidualny = pass({
      id: "indywidualny",
      forIndividual: true,
      endsAt: new Date("2026-09-01"),
    });
    expect(pickPassForSession([grupowyPozniejszy, indywidualny], "INDIVIDUAL")?.id).toBe(
      "indywidualny",
    );
  });

  // Klient dokupił kolejny karnet przed końcem starego - stary ma zejść
  // pierwszy, inaczej przepadłby z niewykorzystanymi wejściami.
  it("wśród pasujących bierze ten kończący się najwcześniej", () => {
    const stary = pass({ id: "stary", endsAt: new Date("2026-08-15") });
    const nowy = pass({ id: "nowy", endsAt: new Date("2026-09-15") });
    expect(pickPassForSession([nowy, stary], "GROUP")?.id).toBe("stary");
  });

  it("pomija karnet bez wejść", () => {
    const pusty = pass({ id: "pusty", entriesLeft: 0, endsAt: new Date("2026-08-15") });
    const zWejsciami = pass({ id: "zWejsciami", endsAt: new Date("2026-09-15") });
    expect(pickPassForSession([pusty, zWejsciami], "GROUP")?.id).toBe("zWejsciami");
  });

  it("karnet OPEN liczy się jako mający wejścia", () => {
    const open = pass({ id: "open", entriesLeft: null });
    expect(pickPassForSession([open], "GROUP")?.id).toBe("open");
  });

  // Klub z jednym rodzajem karnetu ma działać jak dotąd: brak pasującego to
  // nie powód, żeby wpuścić kogoś za darmo.
  it("bez pasującego karnetu bierze jakikolwiek", () => {
    const grupowy = pass({ id: "grupowy" });
    expect(pickPassForSession([grupowy], "INDIVIDUAL")?.id).toBe("grupowy");
  });

  it("brak karnetów to null", () => {
    expect(pickPassForSession([], "GROUP")).toBeNull();
  });

  it("same puste karnety to null", () => {
    expect(pickPassForSession([pass({ id: "pusty", entriesLeft: 0 })], "GROUP")).toBeNull();
  });
});
