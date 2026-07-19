"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { isValidNoteBody, MIN_NOTE_LENGTH } from "@/lib/domain/retention";
import { logActivity } from "@/lib/services/activity";

const RETENTION_TASK_LABEL: Record<string, string> = {
  INACTIVE_7: "Brak treningu od 7 dni",
  INACTIVE_14: "Brak treningu od 14 dni",
  RENEWAL: "Kończy się karnet",
};

// CLAUDE.md reguła 3: zamknięcie zadania kontaktowego wymaga treści notatki
// (min. 30 znaków). Samo kliknięcie "zrobione" nie zamyka zadania - nigdy
// żadnego skrótu.
export async function addNoteAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const kind = String(formData.get("kind") ?? "GENERAL");
  const body = String(formData.get("body") ?? "");

  const session = await requireOwnsMember(memberId);
  if (!isValidNoteBody(body)) {
    throw new Error(`Notatka musi mieć co najmniej ${MIN_NOTE_LENGTH} znaków.`);
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.$transaction(async (tx) => {
    await tx.note.create({
      data: {
        memberId,
        authorUserId: session.user.id,
        kind: kind === "ONBOARDING" || kind === "CONTACT" ? kind : "GENERAL",
        body: body.trim(),
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "NOTE_ADDED",
      memberId,
      summary: `Dodano notatkę (${kind}) dla ${member.firstName} ${member.lastName}`,
    });
  });

  revalidatePath(`/trainer/podopieczni/${memberId}`);
}

export async function completeOnboardingStepAction(formData: FormData) {
  const onboardingStepId = String(formData.get("onboardingStepId"));
  const memberId = String(formData.get("memberId"));
  const body = String(formData.get("body") ?? "");

  const session = await requireOwnsMember(memberId);
  if (!isValidNoteBody(body)) {
    throw new Error(`Notatka musi mieć co najmniej ${MIN_NOTE_LENGTH} znaków.`);
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: { memberId, authorUserId: session.user.id, kind: "ONBOARDING", body: body.trim() },
    });
    await tx.onboardingStep.update({
      where: { id: onboardingStepId },
      data: { completedAt: new Date(), noteId: note.id },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "ONBOARDING_STEP_COMPLETED",
      memberId,
      summary: `Zamknięto etap onboardingu dla ${member.firstName} ${member.lastName}`,
    });
  });

  revalidatePath(`/trainer/podopieczni/${memberId}`);
}

export async function closeRetentionTaskAction(formData: FormData) {
  const retentionTaskId = String(formData.get("retentionTaskId"));
  const memberId = String(formData.get("memberId"));
  const body = String(formData.get("body") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/trainer/podopieczni/${memberId}`);

  const session = await requireOwnsMember(memberId);
  if (!isValidNoteBody(body)) {
    throw new Error(`Notatka musi mieć co najmniej ${MIN_NOTE_LENGTH} znaków.`);
  }

  const [member, task] = await Promise.all([
    prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    prisma.retentionTask.findUniqueOrThrow({ where: { id: retentionTaskId } }),
  ]);

  await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: { memberId, authorUserId: session.user.id, kind: "CONTACT", body: body.trim() },
    });
    await tx.retentionTask.update({
      where: { id: retentionTaskId },
      data: { closedAt: new Date(), closingNoteId: note.id },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "RETENTION_TASK_CLOSED",
      memberId,
      summary: `Zamknięto zadanie "${RETENTION_TASK_LABEL[task.type] ?? task.type}" dla ${member.firstName} ${member.lastName}`,
    });
  });

  revalidatePath("/trainer/alerty");
  revalidatePath(returnTo);
}

// Pomiar wagi (SPEC.md sekcja 3 "Postępy") - loguje trener na karcie klienta,
// klient widzi historię w /app/postepy (tylko do odczytu).
export async function addMeasurementAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const weightKgRaw = String(formData.get("weightKg") ?? "");

  const session = await requireOwnsMember(memberId);
  const weightKg = Number(weightKgRaw);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error("Podaj poprawną wagę.");
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.$transaction(async (tx) => {
    await tx.measurement.create({
      data: { memberId, weightKg, recordedByUserId: session.user.id },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "MEASUREMENT_ADDED",
      memberId,
      summary: `Zapisano pomiar wagi (${weightKg} kg) dla ${member.firstName} ${member.lastName}`,
    });
  });

  revalidatePath(`/trainer/podopieczni/${memberId}`);
}

// Zamknięcie zgłoszenia nieobecności/kontuzji - klient wrócił albo trener
// wie, że temat jest już nieaktualny. Odblokowuje z powrotem detectInactive.
export async function resolveAbsenceReportAction(formData: FormData) {
  const absenceReportId = String(formData.get("absenceReportId"));
  const memberId = String(formData.get("memberId"));
  await requireOwnsMember(memberId);

  await prisma.absenceReport.update({
    where: { id: absenceReportId },
    data: { resolvedAt: new Date() },
  });

  revalidatePath(`/trainer/podopieczni/${memberId}`);
}
