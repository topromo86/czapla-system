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

export const MIN_NOTE_LENGTH = 30;

// CLAUDE.md reguła 3: zamknięcie zadania kontaktowego wymaga treści notatki.
// Nigdy skrótu typu "oznacz jako wykonane".
export function isValidNoteBody(body: string, minLength: number = MIN_NOTE_LENGTH): boolean {
  return body.trim().length >= minLength;
}
