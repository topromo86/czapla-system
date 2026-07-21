"use server";

import { signIn } from "@/auth";

// Start logowania przez Google. Po powrocie z Google trafiamy na /app; layout
// /app przekieruje nowe konto na /dokoncz-profil, jeśli brak kartoteki.
export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/app" });
}
