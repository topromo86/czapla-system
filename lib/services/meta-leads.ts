import "server-only";
import type { ParsedLead } from "@/lib/domain/lead-import";

// Gniazdo integracji z Meta Lead Ads (Graph API) - docelowo pobiera leady
// z Facebooka/Instagrama automatycznie, zamiast ręcznego importu CSV.
//
// Świadomie zbudowane tym samym wzorcem co SMTP i SMS (patrz notify.ts):
// konfiguracja z env, brak kompletu = kanał "nieaktywny" zgłaszany wprost,
// zamiast udawania, że działa. Realny fetch dopiszemy po podłączeniu konta
// Meta - reszta systemu (dedup po source+externalId, historia leada) jest już
// gotowa i importMeta -> upsert pójdzie tą samą ścieżką co import CSV.

export type MetaLeadsConfig = {
  accessToken: string;
  formId: string;
};

// Jedno miejsce odczytu konfiguracji Meta ze środowiska. null = brak kompletu.
export function readMetaLeadsConfig(): MetaLeadsConfig | null {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const formId = process.env.META_LEAD_FORM_ID;
  if (!accessToken || !formId) return null;
  return { accessToken, formId };
}

export function isMetaLeadsConfigured(): boolean {
  return readMetaLeadsConfig() !== null;
}

export type MetaFetchResult =
  | { ok: false; reason: "NOT_CONFIGURED" }
  | { ok: true; leads: ParsedLead[] };

// Pobranie leadów z Graph API (GET /{form-id}/leads). Dopóki brak tokenu,
// zwraca NOT_CONFIGURED - wywołujący (przyszły cron/akcja "Pobierz z Meta")
// mapuje wynik na te same ParsedLead co CSV i przepuszcza przez istniejącą
// deduplikację w lib/services/lead.ts.
export async function fetchLeadsFromMeta(): Promise<MetaFetchResult> {
  const config = readMetaLeadsConfig();
  if (!config) return { ok: false, reason: "NOT_CONFIGURED" };

  // TODO: realny fetch po podłączeniu konta Meta:
  //   GET https://graph.facebook.com/v21.0/{formId}/leads?access_token=...
  //   -> zmapować field_data na ParsedLead (fullName/email/phone + rawData,
  //      externalId = id leada z Meta, source = FACEBOOK/INSTAGRAM z platform).
  // Do tego czasu gniazdo jest gotowe, ale nic nie pobiera.
  console.warn("[meta-leads] Konfiguracja obecna, ale realny fetch jeszcze nie podłączony.");
  return { ok: true, leads: [] };
}
