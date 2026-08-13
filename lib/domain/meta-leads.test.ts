import { describe, expect, it } from "vitest";
import {
  extractLeadFields,
  parseLeadgenWebhook,
  placeholderName,
  readFieldData,
} from "./meta-leads";

const webhook = {
  object: "page",
  entry: [
    {
      id: "111",
      time: 1_760_000_000,
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: "999888777",
            form_id: "555",
            page_id: "111",
            created_time: 1_760_000_000,
          },
        },
      ],
    },
  ],
};

describe("parseLeadgenWebhook", () => {
  it("czyta zgłoszenie z webhooka", () => {
    const [lead] = parseLeadgenWebhook(webhook);
    expect(lead.leadgenId).toBe("999888777");
    expect(lead.formId).toBe("555");
    expect(lead.createdTime?.toISOString()).toBe(new Date(1_760_000_000 * 1000).toISOString());
  });

  it("czyta kilka zgłoszeń naraz", () => {
    const many = {
      object: "page",
      entry: [
        { changes: [{ field: "leadgen", value: { leadgen_id: "a" } }] },
        { changes: [{ field: "leadgen", value: { leadgen_id: "b" } }] },
      ],
    };
    expect(parseLeadgenWebhook(many).map((l) => l.leadgenId)).toEqual(["a", "b"]);
  });

  // Meta wysyła tym samym kanałem zdarzenia innych typów - mają odpaść cicho,
  // a nie wywalić obsługi webhooka.
  it("pomija zdarzenia, które nie są leadgen", () => {
    const other = {
      object: "page",
      entry: [{ changes: [{ field: "feed", value: { post_id: "1" } }] }],
    };
    expect(parseLeadgenWebhook(other)).toEqual([]);
  });

  it("pomija zgłoszenie bez identyfikatora", () => {
    const broken = { object: "page", entry: [{ changes: [{ field: "leadgen", value: {} }] }] };
    expect(parseLeadgenWebhook(broken)).toEqual([]);
  });

  it("odrzuca ciało spoza strony", () => {
    expect(parseLeadgenWebhook({ object: "instagram", entry: [] })).toEqual([]);
  });

  it("nie wywraca się na śmieciach", () => {
    expect(parseLeadgenWebhook(null)).toEqual([]);
    expect(parseLeadgenWebhook("nie json")).toEqual([]);
    expect(parseLeadgenWebhook({})).toEqual([]);
  });
});

describe("readFieldData", () => {
  const fields = [
    { name: "full_name", values: ["Jan Kowalski"] },
    { name: "email", values: ["jan@example.com"] },
    { name: "phone_number", values: ["+48500600700"] },
  ];

  it("czyta pole po nazwie", () => {
    expect(readFieldData(fields, ["full_name"])).toBe("Jan Kowalski");
  });

  it("nie rozróżnia wielkości liter", () => {
    expect(readFieldData([{ name: "Email", values: ["a@b.pl"] }], ["email"])).toBe("a@b.pl");
  });

  // Nazwy pól zależą od formularza ułożonego w Menedżerze reklam - dlatego
  // szukamy po liście typowych nazw, także polskich.
  it("bierze pierwszą pasującą nazwę z listy", () => {
    const polish = [{ name: "numer_telefonu", values: ["500600700"] }];
    expect(readFieldData(polish, ["phone_number", "numer_telefonu"])).toBe("500600700");
  });

  it("pomija puste wartości", () => {
    expect(readFieldData([{ name: "email", values: ["  "] }], ["email"])).toBeNull();
  });

  it("brak pola to null, nie pusty string", () => {
    expect(readFieldData(fields, ["nie_ma"])).toBeNull();
  });
});

describe("extractLeadFields", () => {
  it("wyciąga komplet danych", () => {
    expect(
      extractLeadFields([
        { name: "full_name", values: ["Anna Nowak"] },
        { name: "email", values: ["anna@example.com"] },
        { name: "telefon", values: ["500600700"] },
      ]),
    ).toEqual({ fullName: "Anna Nowak", email: "anna@example.com", phone: "500600700" });
  });

  it("braki zwraca jako null", () => {
    expect(extractLeadFields([])).toEqual({ fullName: null, email: null, phone: null });
  });
});

describe("placeholderName", () => {
  it("zawiera końcówkę identyfikatora, żeby dało się odszukać w Meta", () => {
    expect(placeholderName("999888777")).toContain("888777");
  });
});
