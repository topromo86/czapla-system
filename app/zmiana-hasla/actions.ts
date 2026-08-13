"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSessionRaw } from "@/lib/auth/guard";
import { validatePassword } from "@/lib/domain/registration";
import { logActivity } from "@/lib/services/activity";
import type { Role } from "@/app/generated/prisma/client";

// Ustawienie własnego hasła przez osobę, której hasło nadał klub.
//
// requireSessionRaw, nie requireSession: zwykły strażnik odsyłałby tę akcję na
// ekran zmiany hasła, czyli sam do siebie.

const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin/pulpit",
  TRAINER: "/trainer/pulpit",
  MEMBER: "/app/pulpit",
  GUARDIAN: "/app/pulpit",
  KIOSK: "/kod-zajec",
};

const ERROR_MESSAGE: Record<string, string> = {
  TOO_SHORT: "Hasło musi mieć co najmniej 8 znaków.",
  NO_LETTER: "Hasło musi zawierać choć jedną literę.",
  NO_DIGIT: "Hasło musi zawierać choć jedną cyfrę.",
};

export async function changePasswordAction(formData: FormData) {
  const session = await requireSessionRaw();

  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  function fail(message: string): never {
    redirect(`/zmiana-hasla?blad=${encodeURIComponent(message)}`);
  }

  if (password !== repeat) fail("Hasła nie są takie same.");

  const invalid = validatePassword(password);
  if (invalid) fail(ERROR_MESSAGE[invalid] ?? "Hasło nie spełnia wymagań.");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { passwordHash: true, role: true },
  });

  // Wpisanie z powrotem hasła otrzymanego od klubu nie kończy sprawy - wtedy
  // nadal zna je dwoje ludzi, a o to właśnie chodziło.
  if (user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
    fail("To jest hasło otrzymane od klubu. Ustaw własne, znane tylko Tobie.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false },
    });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SETTINGS_UPDATED",
      summary: "Ustawiono własne hasło po pierwszym logowaniu",
    });
  });

  redirect(ROLE_HOME[user.role] ?? "/app/pulpit");
}
