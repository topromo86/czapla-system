"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  PASSWORD_ERROR_MESSAGE,
  normalizeEmail,
  validatePassword,
} from "@/lib/domain/registration";
import { hashPassword, requestPasswordReset, resetPassword } from "@/lib/services/password-reset";

// Adres aplikacji z nagłówków żądania - link resetu musi wskazywać na ten sam
// host, z którego przyszła prośba, bez wpisywania go na sztywno.
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type RequestState = { done?: boolean; error?: string };

export async function requestResetAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Podaj adres e-mail." };

  // Zawsze kończymy tym samym komunikatem, także gdy konta nie ma - żeby
  // formularz nie zdradzał, które adresy są w bazie.
  await requestPasswordReset(email, await baseUrl());
  return { done: true };
}

export type ResetState = { error?: string };

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) return { error: PASSWORD_ERROR_MESSAGE[passwordError] };
  if (password !== confirmPassword) return { error: "Hasła nie są takie same." };

  const result = await resetPassword(token, await hashPassword(password));
  if (result === "INVALID_OR_EXPIRED") {
    return { error: "Link wygasł lub został już użyty. Poproś o nowy." };
  }

  redirect("/login?haslo-zmienione=1");
}
