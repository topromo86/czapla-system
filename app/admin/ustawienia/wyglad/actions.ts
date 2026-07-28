"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activity";
import { FONT_THEMES, isFontThemeId } from "@/lib/domain/font-themes";

export async function saveFontThemeAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const fontTheme = String(formData.get("fontTheme") ?? "");
  if (!isFontThemeId(fontTheme)) redirect("/admin/ustawienia/wyglad?blad=1");

  await prisma.clubSettings.upsert({
    where: { id: "singleton" },
    update: { fontTheme },
    create: { id: "singleton", fontTheme },
  });

  await logActivity(prisma, {
    actorUserId: session.user.id,
    action: "SETTINGS_UPDATED",
    summary: `Zmieniono zestaw czcionek na: ${FONT_THEMES.find((t) => t.id === fontTheme)?.label ?? fontTheme}`,
  });

  // Root layout czyta fontTheme, więc przeładowujemy cały layout aplikacji.
  revalidatePath("/", "layout");
  redirect("/admin/ustawienia/wyglad?zapisano=1");
}
