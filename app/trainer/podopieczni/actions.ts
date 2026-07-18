"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnsMember } from "@/lib/auth/guard";
import { isValidNoteBody, MIN_NOTE_LENGTH } from "@/lib/domain/retention";

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

  await prisma.note.create({
    data: {
      memberId,
      authorUserId: session.user.id,
      kind: kind === "ONBOARDING" || kind === "CONTACT" ? kind : "GENERAL",
      body: body.trim(),
    },
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

  await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: { memberId, authorUserId: session.user.id, kind: "ONBOARDING", body: body.trim() },
    });
    await tx.onboardingStep.update({
      where: { id: onboardingStepId },
      data: { completedAt: new Date(), noteId: note.id },
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

  await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: { memberId, authorUserId: session.user.id, kind: "CONTACT", body: body.trim() },
    });
    await tx.retentionTask.update({
      where: { id: retentionTaskId },
      data: { closedAt: new Date(), closingNoteId: note.id },
    });
  });

  revalidatePath("/trainer/alerty");
  revalidatePath(returnTo);
}
