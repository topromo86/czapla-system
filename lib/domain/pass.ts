// Klasyfikacja karnetu do wyświetlenia (kolor/status) na ekranach admina.
// Czysta funkcja - SPEC.md nie definiuje progu "kończy się wkrótce", przyjęty
// tu na życzenie klienta: 7 dni.

export const PASS_EXPIRING_SOON_DAYS = 7;

export type PassStatusBadge = "NONE" | "EXPIRING_SOON" | "ACTIVE";

export function classifyPassStatus(
  pass: { endsAt: Date } | null,
  now: Date,
  warningDays: number = PASS_EXPIRING_SOON_DAYS,
): PassStatusBadge {
  if (!pass) return "NONE";
  const warningThreshold = new Date(now.getTime() + warningDays * 86_400_000);
  if (pass.endsAt <= warningThreshold) return "EXPIRING_SOON";
  return "ACTIVE";
}
