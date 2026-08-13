// Gniazdo na leady z Meta (Facebook/Instagram Lead Ads).
//
// Czysta część: rozpoznanie, co przyszło w webhooku, i przełożenie pól
// formularza Meta na dane leada. Podpis i wywołania do Graph API siedzą
// w warstwie serwerowej - tutaj jest wyłącznie to, co da się przetestować bez
// sieci i bez sekretów.
//
// Meta w webhooku NIE przysyła danych osoby, tylko identyfikator zgłoszenia
// (leadgen_id). Po treść trzeba pójść do Graph API tokenem strony. Dlatego
// import ma dwa stopnie: najpierw zapisujemy fakt zgłoszenia (żeby nic nie
// zginęło, nawet gdy token nie jest jeszcze wpisany), potem uzupełniamy dane.

export type MetaLeadgenEntry = {
  leadgenId: string;
  formId: string | null;
  pageId: string | null;
  createdTime: Date | null;
};

type Json = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Wyciąga zgłoszenia z ciała webhooka. Meta pakuje je w entry[].changes[],
// potrafi przysłać kilka naraz i miesza w to zdarzenia innych typów - bierzemy
// wyłącznie "leadgen", resztę cicho pomijamy.
export function parseLeadgenWebhook(body: unknown): MetaLeadgenEntry[] {
  if (typeof body !== "object" || body === null) return [];
  const root = body as Json;
  if (root.object !== "page") return [];

  const entries = Array.isArray(root.entry) ? root.entry : [];
  const out: MetaLeadgenEntry[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const changes = Array.isArray((entry as Json).changes) ? (entry as Json).changes : [];
    for (const change of changes as unknown[]) {
      if (typeof change !== "object" || change === null) continue;
      const c = change as Json;
      if (c.field !== "leadgen") continue;

      const value = typeof c.value === "object" && c.value !== null ? (c.value as Json) : {};
      const leadgenId = asString(value.leadgen_id);
      if (!leadgenId) continue;

      const created = Number(value.created_time);
      out.push({
        leadgenId,
        formId: asString(value.form_id),
        pageId: asString(value.page_id),
        // Meta podaje czas w sekundach uniksowych.
        createdTime: Number.isFinite(created) ? new Date(created * 1000) : null,
      });
    }
  }

  return out;
}

export type MetaFieldEntry = { name?: unknown; values?: unknown };

// Odpowiedź Graph API: field_data to lista { name, values: [...] }. Nazwy pól
// zależą od formularza, który klub ułożył w Menedżerze reklam, więc szukamy po
// zestawie typowych nazw, a nie po jednej sztywnej.
export function readFieldData(
  fieldData: readonly MetaFieldEntry[],
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const found = fieldData.find(
      (f) => typeof f.name === "string" && f.name.toLowerCase() === candidate,
    );
    const values = Array.isArray(found?.values) ? found.values : [];
    const value = values.find((v) => typeof v === "string" && v.trim().length > 0);
    if (typeof value === "string") return value.trim();
  }
  return null;
}

export const META_NAME_FIELDS = ["full_name", "imie_i_nazwisko", "name", "imię_i_nazwisko"];
export const META_EMAIL_FIELDS = ["email", "e-mail", "adres_e-mail"];
export const META_PHONE_FIELDS = ["phone_number", "telefon", "numer_telefonu", "phone"];

export type MetaLeadFields = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

export function extractLeadFields(fieldData: readonly MetaFieldEntry[]): MetaLeadFields {
  return {
    fullName: readFieldData(fieldData, META_NAME_FIELDS),
    email: readFieldData(fieldData, META_EMAIL_FIELDS),
    phone: readFieldData(fieldData, META_PHONE_FIELDS),
  };
}

// Nazwa pokazywana w kartotece, gdy Meta nie przysłała jeszcze danych osoby
// (brak tokenu do Graph API). Lepiej mieć wpis "do uzupełnienia" niż zgubić
// zgłoszenie - klub widzi, że ktoś się zgłosił, i może dopytać w Menedżerze.
export function placeholderName(leadgenId: string): string {
  return `Lead z Meta (do uzupełnienia) ${leadgenId.slice(-6)}`;
}
