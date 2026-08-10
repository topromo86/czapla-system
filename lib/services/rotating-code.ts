import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildCode,
  codePayload,
  isPeriodAcceptable,
  parseCode,
  periodNumber,
  type CodeRejection,
} from "@/lib/domain/rotating-code";

// Podpisywanie i sprawdzanie osobistych kodów rotacyjnych.
//
// Sekret to AUTH_SECRET - ten sam, którym podpisywane są sesje. Nie zakładamy
// osobnej zmiennej, bo kolejny sekret to kolejna rzecz do zgubienia przy
// wdrożeniu, a wymagania są tu identyczne: ma być tajny i stały.
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    // Bez sekretu kod dałoby się podrobić - lepiej głośno niż po cichu.
    throw new Error("Brak AUTH_SECRET - nie da się podpisać kodu wejścia.");
  }
  return value;
}

// 10 znaków hex wystarczy: kod żyje 30 s, a zgadywanie po omacku przy jednej
// próbie na skan jest bez szans. Krótszy kod to mniejszy, czytelniejszy QR.
function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 10);
}

export function currentCodeFor(userId: string, now: Date = new Date()): string {
  const period = periodNumber(now);
  return buildCode(userId, period, sign(codePayload(userId, period)));
}

export type CodeVerdict = { ok: true; userId: string } | { ok: false; reason: CodeRejection };

// Weryfikacja kodu z kamery. Kolejność sprawdzeń ma znaczenie: najpierw
// kształt, potem czas, na końcu podpis - dzięki temu "kod sprzed godziny"
// dostaje własny komunikat zamiast ogólnego "zły kod".
export function verifyRotatingCode(raw: string, now: Date = new Date()): CodeVerdict {
  const parsed = parseCode(raw);
  if (!parsed) return { ok: false, reason: "MALFORMED" };
  if (!isPeriodAcceptable(parsed.period, now)) return { ok: false, reason: "EXPIRED" };

  const expected = sign(codePayload(parsed.userId, parsed.period));
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.signature);
  // Porównanie stałoczasowe - inaczej czas odpowiedzi zdradzałby, ile znaków
  // podpisu się zgadza.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  return { ok: true, userId: parsed.userId };
}
