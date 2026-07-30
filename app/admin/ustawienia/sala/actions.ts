"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activity";

const MAX_FLOOR_MINUTES = 240;

export async function saveFloorMinutesAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const raw = Number(formData.get("floorMinMinutes"));
  if (!Number.isInteger(raw) || raw < 0 || raw > MAX_FLOOR_MINUTES) {
    redirect("/admin/ustawienia/sala?blad=1");
  }

  await prisma.clubSettings.upsert({
    where: { id: "singleton" },
    update: { floorMinMinutes: raw },
    create: { id: "singleton", floorMinMinutes: raw },
  });

  await logActivity(prisma, {
    actorUserId: session.user.id,
    action: "SETTINGS_UPDATED",
    summary: `Zmieniono minimalny czas na sali: ${raw} min`,
  });

  revalidatePath("/admin/ustawienia/sala");
  revalidatePath("/skaner");
  redirect("/admin/ustawienia/sala?zapisano=1");
}
