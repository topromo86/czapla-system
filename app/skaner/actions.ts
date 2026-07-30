"use server";

import { requireRole } from "@/lib/auth/guard";
import { recordFloorCheckInByToken } from "@/lib/services/floor-checkin";
import { isVisitValid, minutesUntilValid } from "@/lib/domain/floor-checkin";
import { getClubSettings } from "@/lib/services/settings";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Właściciel",
  TRAINER: "Trener",
  MEMBER: "Klubowicz",
  GUARDIAN: "Opiekun",
};

export type ScanResult =
  | { ok: false; message: string }
  | {
      ok: true;
      alreadyOnFloor: boolean;
      name: string;
      roleLabel: string;
      enteredAtIso: string;
      valid: boolean;
      minutesLeft: number;
    };

// Wywoływana programowo z komponentu stacji (nie z formularza) - zwraca wynik,
// który stacja pokazuje obsłudze. Stację obsługuje zalogowany personel
// (ADMIN/TRENER) na zaufanym urządzeniu na sali - to jest gwarancja "odbicia
// tylko na miejscu", której nie daje kod na ścianie skanowany z domu.
export async function scanCheckInAction(token: string, locationId: string): Promise<ScanResult> {
  const session = await requireRole("ADMIN", "TRAINER");

  const cleaned = token.trim();
  if (!cleaned) return { ok: false, message: "Pusty kod." };
  if (!locationId) return { ok: false, message: "Wybierz lokalizację stacji." };

  const result = await recordFloorCheckInByToken({
    token: cleaned,
    locationId,
    recordedByUserId: session.user.id,
  });

  if (!result.ok) {
    return { ok: false, message: "Nieznany kod - to nie jest kod wejścia z tej aplikacji." };
  }

  const now = new Date();
  const { floorMinMinutes } = await getClubSettings();

  return {
    ok: true,
    alreadyOnFloor: result.outcome === "ALREADY_ON_FLOOR",
    name: result.user.name,
    roleLabel: ROLE_LABEL[result.user.role] ?? "Konto",
    enteredAtIso: result.enteredAt.toISOString(),
    valid: isVisitValid(result.enteredAt, now, floorMinMinutes),
    minutesLeft: minutesUntilValid(result.enteredAt, now, floorMinMinutes),
  };
}
