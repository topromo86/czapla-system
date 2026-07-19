"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// Zamknięcie przeglądu próbki (SPEC.md sekcja 2 "Audyt jakości") - właściciel
// potwierdza, że przeczytał notatkę wylosowaną przez computeScores.
export async function markNoteReviewedAction(formData: FormData) {
  await requireRole("ADMIN");
  const noteId = String(formData.get("noteId"));

  await prisma.note.update({
    where: { id: noteId },
    data: { reviewedAt: new Date() },
  });

  revalidatePath("/admin/audyt-notatek");
}
