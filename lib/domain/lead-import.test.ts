import { describe, expect, it } from "vitest";
import {
  buildWelcomeSms,
  buildWelcomeEmail,
  parseWelcomeChannel,
  missingWelcomeContact,
  normalizePhone,
  parseCsv,
  parseLeadsCsv,
  splitFullName,
} from "./lead-import";

describe("normalizePhone", () => {
  it("usuwa spacje, myślniki i nawiasy", () => {
    expect(normalizePhone("+48 555-111 222")).toBe("+48555111222");
    expect(normalizePhone("(48) 555 111 222")).toBe("48555111222");
  });

  it("akceptuje numer bez plusa", () => {
    expect(normalizePhone("555111222")).toBe("555111222");
  });

  it("odrzuca za krótkie i za długie", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
  });

  it("odrzuca litery i śmieci", () => {
    expect(normalizePhone("zadzwon-do-mnie")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("buildWelcomeSms", () => {
  it("zawiera imię, gdy podane", () => {
    const msg = buildWelcomeSms("Marek");
    expect(msg).toContain("Cześć Marek!");
    expect(msg).toContain("Czapla Boxing");
  });

  it("działa bez imienia", () => {
    const msg = buildWelcomeSms("");
    expect(msg.startsWith("Cześć!")).toBe(true);
  });

  it("mieści się w rozsądnej długości SMS", () => {
    expect(buildWelcomeSms("Aleksandra").length).toBeLessThanOrEqual(160);
  });
});

describe("splitFullName", () => {
  it("dzieli imię i nazwisko", () => {
    expect(splitFullName("Anna Kowalska")).toEqual({ firstName: "Anna", lastName: "Kowalska" });
  });

  it("wieloczłonowe nazwisko trafia w całości do lastName", () => {
    expect(splitFullName("Anna Kowalska-Nowak Wiśniewska")).toEqual({
      firstName: "Anna",
      lastName: "Kowalska-Nowak Wiśniewska",
    });
  });

  it("samo imię zostawia puste nazwisko", () => {
    expect(splitFullName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
  });

  it("przycina i normalizuje wielokrotne spacje", () => {
    expect(splitFullName("  Jan   Nowak  ")).toEqual({ firstName: "Jan", lastName: "Nowak" });
  });

  it("pusty string daje puste pola", () => {
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("parseCsv", () => {
  it("dzieli proste wiersze i kolumny", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("obsługuje cudzysłowy z przecinkiem i nową linią w polu", () => {
    const csv = 'name,note\n"Kowalski, Jan","wiersz1\nwiersz2"';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Kowalski, Jan", "wiersz1\nwiersz2"],
    ]);
  });

  it("podwójny cudzysłów w polu to znak dosłowny", () => {
    expect(parseCsv('x\n"ma ""cudzysłów"""')).toEqual([["x"], ['ma "cudzysłów"']]);
  });

  it("radzi sobie z CRLF i pustą linią na końcu", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseLeadsCsv", () => {
  it("mapuje standardowe kolumny Meta i rozpoznaje platformę", () => {
    const csv = [
      "id,full_name,email,phone_number,platform,campaign_name",
      "L1,Jan Kowalski,jan@example.com,+48500600700,instagram,Boks jesień",
    ].join("\n");
    const { leads, skipped } = parseLeadsCsv(csv);
    expect(skipped).toBe(0);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      externalId: "L1",
      fullName: "Jan Kowalski",
      email: "jan@example.com",
      phone: "+48500600700",
      source: "INSTAGRAM",
      campaign: "Boks jesień",
    });
    expect(leads[0].rawData["campaign_name"]).toBe("Boks jesień");
  });

  it("rozpoznaje polskie nagłówki i domyślną platformę", () => {
    const csv = ["Imię i nazwisko,Telefon,Adres e-mail", "Anna Nowak,111222333,"].join("\n");
    const { leads } = parseLeadsCsv(csv);
    expect(leads[0]).toMatchObject({
      fullName: "Anna Nowak",
      phone: "111222333",
      email: null,
      source: "META_OTHER",
    });
  });

  it("fullName ma fallback na e-mail, gdy brak imienia", () => {
    const csv = ["full_name,email", ",ktos@example.com"].join("\n");
    expect(parseLeadsCsv(csv).leads[0].fullName).toBe("ktos@example.com");
  });

  it("pomija wiersz z treścią, ale bez danych kontaktowych", () => {
    // Wiersz ma wartość w nieznanej kolumnie, ale brak imienia/e-maila/telefonu.
    const csv = ["full_name,email,phone_number,notatka", ",,,coś", "Jan,,500,"].join("\n");
    const { leads, skipped } = parseLeadsCsv(csv);
    expect(leads).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("pusty plik / sam nagłówek → brak leadów", () => {
    expect(parseLeadsCsv("full_name,email")).toEqual({ leads: [], skipped: 0 });
  });
});

describe("buildWelcomeEmail", () => {
  it("wita po imieniu", () => {
    expect(buildWelcomeEmail("Marek").text).toContain("Cześć Marek!");
  });

  it("bez imienia nie zostawia dziury", () => {
    const mail = buildWelcomeEmail("");
    expect(mail.text).toContain("Cześć!");
    expect(mail.text).not.toContain("Cześć !");
  });

  it("ma temat z nazwą klubu", () => {
    expect(buildWelcomeEmail("Ala").subject).toContain("Czapla Boxing");
  });
});

describe("parseWelcomeChannel", () => {
  it("czyta wartości z formularza", () => {
    expect(parseWelcomeChannel("SMS")).toBe("SMS");
    expect(parseWelcomeChannel("EMAIL")).toBe("EMAIL");
    expect(parseWelcomeChannel("BOTH")).toBe("BOTH");
  });

  // Domyślnie NIC nie wysyłamy - powitanie musi być świadomym wyborem.
  it("wszystko inne to brak wysyłki", () => {
    expect(parseWelcomeChannel(null)).toBe("NONE");
    expect(parseWelcomeChannel("")).toBe("NONE");
    expect(parseWelcomeChannel("cokolwiek")).toBe("NONE");
  });
});

describe("missingWelcomeContact", () => {
  it("SMS wymaga telefonu", () => {
    expect(missingWelcomeContact("SMS", { phone: null, email: "a@b.pl" })).toContain("numer");
    expect(missingWelcomeContact("SMS", { phone: "500600700", email: null })).toBeNull();
  });

  it("e-mail wymaga adresu", () => {
    expect(missingWelcomeContact("EMAIL", { phone: "500600700", email: null })).toContain("e-mail");
    expect(missingWelcomeContact("EMAIL", { phone: null, email: "a@b.pl" })).toBeNull();
  });

  it("oba kanały wymagają obu danych", () => {
    expect(missingWelcomeContact("BOTH", { phone: "500600700", email: null })).toContain("e-mail");
    expect(missingWelcomeContact("BOTH", { phone: null, email: "a@b.pl" })).toContain("numer");
    expect(missingWelcomeContact("BOTH", { phone: "500600700", email: "a@b.pl" })).toBeNull();
  });

  it("brak powitania nie wymaga niczego", () => {
    expect(missingWelcomeContact("NONE", { phone: null, email: null })).toBeNull();
  });
});
