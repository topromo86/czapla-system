"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLeadAccess } from "@/lib/auth/guard";
import { zonedTimeToUtc } from "@/lib/domain/time";
import { LEAD_STATUS_LABEL, LEAD_STATUS_ORDER } from "@/lib/domain/lead-import";
import { importLeadsFromCsv, logLeadActivity } from "@/lib/services/lead";
import type { LeadStatus } from "@/app/generated/prisma/client";

// Import CSV: plik z inputa albo wklejony tekst. Po imporcie wracamy na listę
// z krótkim podsumowaniem (dodano / duplikaty / pominięto).
export async function importCsvAction(formData: FormData) {
  const session = await requireLeadAccess();

  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  let csv = pasted.trim();
  if ((!csv || csv.length === 0) && file instanceof File && file.size > 0) {
    csv = await file.text();
  }
  if (!csv) redirect("/leady?import=empty");

  const result = await importLeadsFromCsv({ csv, actorUserId: session.user.id });
  revalidatePath("/leady");
  redirect(
    `/leady?import=ok&created=${result.created}&dup=${result.duplicates}&skip=${result.skipped}`,
  );
}

function parseLocalDateTime(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  // datetime-local nie niesie strefy - traktujemy jako czas w Europe/Warsaw.
  return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

export async function setReminderAction(formData: FormData) {
  const session = await requireLeadAccess();
  const leadId = String(formData.get("leadId"));
  const value = String(formData.get("reminder") ?? "");
  const at = parseLocalDateTime(value);
  if (!at) redirect(`/leady/${leadId}?blad=data`);

  await prisma.$transaction(async (tx) => {
    // Ustawienie przypomnienia zwykle znaczy "oddzwonić później" - podnosimy
    // status do CALLBACK, o ile lead nie jest już potwierdzony/zamknięty.
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { status: true } });
    const bumpToCallback = lead.status === "NEW" || lead.status === "IN_PROGRESS";
    await tx.lead.update({
      where: { id: leadId },
      data: { reminderAt: at, ...(bumpToCallback ? { status: "CALLBACK" as LeadStatus } : {}) },
    });
    await logLeadActivity(tx, {
      leadId,
      actorUserId: session.user.id,
      kind: "REMINDER_SET",
      summary: `Ustawiono przypomnienie o ponownym kontakcie na ${at.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}`,
    });
  });
  revalidatePath(`/leady/${leadId}`);
  redirect(`/leady/${leadId}`);
}

export async function clearReminderAction(formData: FormData) {
  await requireLeadAccess();
  const leadId = String(formData.get("leadId"));
  await prisma.lead.update({ where: { id: leadId }, data: { reminderAt: null } });
  revalidatePath(`/leady/${leadId}`);
  redirect(`/leady/${leadId}`);
}

export async function updateStatusAction(formData: FormData) {
  const session = await requireLeadAccess();
  const leadId = String(formData.get("leadId"));
  const status = String(formData.get("status")) as LeadStatus;
  if (!LEAD_STATUS_ORDER.includes(status)) redirect(`/leady/${leadId}?blad=status`);

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: { status } });
    await logLeadActivity(tx, {
      leadId,
      actorUserId: session.user.id,
      kind: "STATUS_CHANGED",
      summary: `Zmiana statusu na: ${LEAD_STATUS_LABEL[status]}`,
    });
  });
  revalidatePath(`/leady/${leadId}`);
  redirect(`/leady/${leadId}`);
}

export async function assignLeadAction(formData: FormData) {
  const session = await requireLeadAccess();
  const leadId = String(formData.get("leadId"));
  const assignedToUserId = String(formData.get("assignedToUserId") ?? "") || null;

  const assignee = assignedToUserId
    ? await prisma.user.findUnique({ where: { id: assignedToUserId }, select: { name: true } })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: { assignedToUserId } });
    await logLeadActivity(tx, {
      leadId,
      actorUserId: session.user.id,
      kind: "ASSIGNED",
      summary: assignee ? `Przypisano do: ${assignee.name}` : "Zdjęto przypisanie",
    });
  });
  revalidatePath(`/leady/${leadId}`);
  redirect(`/leady/${leadId}`);
}

export async function addLeadNoteAction(formData: FormData) {
  const session = await requireLeadAccess();
  const leadId = String(formData.get("leadId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`/leady/${leadId}`);

  await prisma.$transaction(async (tx) => {
    await tx.leadNote.create({ data: { leadId, authorUserId: session.user.id, body } });
    await logLeadActivity(tx, {
      leadId,
      actorUserId: session.user.id,
      kind: "NOTE_ADDED",
      summary: "Dodano notatkę",
    });
  });
  revalidatePath(`/leady/${leadId}`);
  redirect(`/leady/${leadId}`);
}
