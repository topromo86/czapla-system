// Parsowanie CSV z leadami (Meta Lead Ads / Ads Manager). Czyste funkcje, bez
// bazy - w pełni testowalne. Układ kolumn w eksportach Meta bywa różny (język,
// wersja formularza), więc mapujemy znane nagłówki elastycznie, a wszystko inne
// zachowujemy w rawData, żeby nic nie zgubić.

import type { LeadSource, LeadStatus } from "@/app/generated/prisma/client";

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  META_OTHER: "Meta",
  MANUAL: "Ręcznie",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nowy",
  IN_PROGRESS: "W kontakcie",
  CALLBACK: "Do oddzwonienia",
  CONFIRMED: "Potwierdzony",
  CONVERTED: "Konto założone",
  REJECTED: "Bez zainteresowania",
};

// Statusy w kolejności lejka - do filtrów i przycisków zmiany statusu.
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "CALLBACK",
  "CONFIRMED",
  "CONVERTED",
  "REJECTED",
];

export type ParsedLead = {
  fullName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  campaign: string | null;
  externalId: string | null;
  rawData: Record<string, string>;
};

export type ParseResult = { leads: ParsedLead[]; skipped: number };

// Parser CSV z obsługą cudzysłowów, przecinków i nowych linii w polach oraz
// podwojonego cudzysłowu ("") jako znaku dosłownego. Zwraca wiersze surowych pól.
export function parseCsv(input: string): string[][] {
  const s = input.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  // Odsiewamy wiersze całkowicie puste (np. pusta linia na końcu pliku).
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const NAME_ALIASES = ["full_name", "full name", "imię i nazwisko", "imie i nazwisko", "name", "nazwa"];
const EMAIL_ALIASES = ["email", "e-mail", "adres e-mail"];
const PHONE_ALIASES = ["phone_number", "phone number", "phone", "numer telefonu", "telefon"];
const CAMPAIGN_ALIASES = ["campaign_name", "campaign", "kampania", "form_name", "formularz"];
const PLATFORM_ALIASES = ["platform", "źródło", "zrodlo"];
const ID_ALIASES = ["lead_id", "id"];

function normalize(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(header: string[], aliases: string[], exact = false): number {
  return header.findIndex((h) => aliases.some((a) => (exact ? h === a : h.includes(a))));
}

function platformToSource(value: string | null): LeadSource {
  const v = (value ?? "").toLowerCase();
  if (v.includes("insta") || v === "ig") return "INSTAGRAM";
  if (v.includes("face") || v === "fb") return "FACEBOOK";
  return "META_OTHER";
}

// Mapuje sparsowany CSV (z wierszem nagłówka) na leady. Pomija wiersze bez
// żadnej treści (skipped). fullName ma fallback na e-mail/telefon, żeby lead
// bez podanego imienia nadal trafił na listę do obdzwonienia.
export function parseLeadsCsv(input: string): ParseResult {
  const rows = parseCsv(input);
  if (rows.length < 2) return { leads: [], skipped: 0 };

  const header = rows[0].map(normalize);
  const nameI = findColumn(header, NAME_ALIASES);
  const emailI = findColumn(header, EMAIL_ALIASES);
  const phoneI = findColumn(header, PHONE_ALIASES);
  const campaignI = findColumn(header, CAMPAIGN_ALIASES);
  const platformI = findColumn(header, PLATFORM_ALIASES);
  const idI = findColumn(header, ID_ALIASES, true);

  const leads: ParsedLead[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const at = (i: number): string | null => {
      if (i < 0 || i >= cells.length) return null;
      const v = cells[i].trim();
      return v.length > 0 ? v : null;
    };

    const email = at(emailI);
    const phone = at(phoneI);
    const fullName = at(nameI) ?? email ?? phone;
    if (!fullName) {
      skipped++;
      continue;
    }

    const rawData: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = rows[0][c]?.trim();
      const val = cells[c]?.trim();
      if (key && val) rawData[key] = val;
    }

    leads.push({
      fullName,
      email,
      phone,
      source: platformToSource(at(platformI)),
      campaign: at(campaignI),
      externalId: at(idI),
      rawData,
    });
  }

  return { leads, skipped };
}
