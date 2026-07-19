// Czyste funkcje warstwy retencji - CLAUDE.md reguła 10: alerty liczone od
// ostatniej obecności, nie od ostatniej rezerwacji. SPEC.md sekcja 2 "Alerty
// retencyjne (job codzienny)" jest źródłem prawdy dla progów.

export function daysSince(referenceDate: Date | null, now: Date): number | null {
  if (!referenceDate) return null;
  return Math.floor((now.getTime() - referenceDate.getTime()) / 86_400_000);
}

export type InactivityAlertType = "INACTIVE_7" | "INACTIVE_14";

// Brak jakiejkolwiek obecności (referenceDate=null) nie kwalifikuje się tutaj -
// to problem onboardingu (OnboardingStep), nie nieaktywności po starcie.
export function classifyInactivityAlert(
  daysSinceLastAttendance: number | null,
): InactivityAlertType | null {
  if (daysSinceLastAttendance == null) return null;
  if (daysSinceLastAttendance >= 14) return "INACTIVE_14";
  if (daysSinceLastAttendance >= 7) return "INACTIVE_7";
  return null;
}

export const TASK_ESCALATION_THRESHOLD_DAYS = 7;

export type EscalatableTask = {
  createdAt: Date;
  closedAt: Date | null;
  escalatedAt: Date | null;
};

// expireOldTasks (SPEC.md sekcja 4): eskalacja zadań otwartych > 7 dni.
export function shouldEscalateTask(
  task: EscalatableTask,
  now: Date,
  thresholdDays: number = TASK_ESCALATION_THRESHOLD_DAYS,
): boolean {
  if (task.closedAt != null) return false;
  if (task.escalatedAt != null) return false;
  return daysSince(task.createdAt, now)! >= thresholdDays;
}

export type RenewalStage = "TASK" | "ESCALATE";

export const RENEWAL_TASK_DAYS_BEFORE_END = 3;
export const RENEWAL_ESCALATE_DAYS_AFTER_END = 3;

// renewalReminders (SPEC.md sekcja 4: "-5 dni powiadomienie, -3 dni zadanie,
// +3 dni eskalacja"). Krok "-5 dni powiadomienie" nie jest osobnym stanem tu -
// pokrywa go już istniejący, szerszy próg PASS_EXPIRING_SOON_DAYS (7 dni,
// lib/domain/pass.ts), czyli wizualna zmiana statusu w apce, ten sam wzorzec
// co przy awansie z listy rezerwowej (Faza 1: "widoczna zmiana statusu, nie
// push/e-mail"). "-3 dni zadanie" i "+3 dni eskalacja" to jedyne kroki, które
// realnie coś zapisują - RetentionTask dla trenera, nigdy mail z systemu.
export function classifyRenewalStage(passEndsAt: Date, now: Date): RenewalStage | null {
  const daysUntilEnd = Math.floor((passEndsAt.getTime() - now.getTime()) / 86_400_000);
  if (daysUntilEnd <= -RENEWAL_ESCALATE_DAYS_AFTER_END) return "ESCALATE";
  if (daysUntilEnd <= RENEWAL_TASK_DAYS_BEFORE_END) return "TASK";
  return null;
}

export const CHURN_THRESHOLD_DAYS = 21;

// churnAndSurvey (SPEC.md sekcja 2 "Ankieta wyjścia"): 21 dni od ostatniej
// obecności -> CHURNED. Celowo liczone tylko od Attendance(method=QR) - to
// samo zastrzeżenie co przy ret90 w Wyniku trenera ("Do ret90 liczą się
// tylko obecności z method=QR"), żeby trener nie mógł wpisami MANUAL sztucznie
// odświeżać klienta i podbijać własnej retencji. Brak jakiejkolwiek obecności
// QR (referenceDate=null, np. świeżo zapisany klient) spada na joinedAt jako
// punkt odniesienia - wywołujący ma to podstawić.
export function shouldChurn(
  referenceDate: Date | null,
  now: Date,
  thresholdDays: number = CHURN_THRESHOLD_DAYS,
): boolean {
  const days = daysSince(referenceDate, now);
  if (days == null) return false;
  return days >= thresholdDays;
}

export const MIN_NOTE_LENGTH = 30;

// CLAUDE.md reguła 3: zamknięcie zadania kontaktowego wymaga treści notatki.
// Nigdy skrótu typu "oznacz jako wykonane".
export function isValidNoteBody(body: string, minLength: number = MIN_NOTE_LENGTH): boolean {
  return body.trim().length >= minLength;
}
