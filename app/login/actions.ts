"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/app/generated/prisma/client";

const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  TRAINER: "/trainer",
  MEMBER: "/app",
  GUARDIAN: "/app",
};

export type LoginState = { error?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Podaj e-mail i hasło." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Nieprawidłowy e-mail lub hasło." };
    }
    throw err;
  }

  // Nie polegamy tu na auth() zaraz po signIn() - świeżo ustawiony cookie sesji
  // bywa niewidoczny w tym samym wywołaniu Server Action (potwierdzone empirycznie).
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  redirect(ROLE_HOME[user?.role ?? "MEMBER"]);
}
