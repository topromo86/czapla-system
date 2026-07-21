"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { readSmtpConfig, sendEmailDiagnostic } from "@/lib/services/notify";
import { logActivity } from "@/lib/services/activity";

// Test wysyłki. Świadomie ślemy na adres nadawcy (SMTP_FROM): to skrzynka
// klubu, więc nie zasypujemy nikogo obcego, a admin od razu widzi wiadomość
// dokładnie taką, jaką dostaną klienci - z tym samym From, kodowaniem i
// podpisem serwera.
export async function sendTestEmailAction() {
  const session = await requireRole("ADMIN");

  const config = readSmtpConfig();
  if (!config) {
    redirect(
      `/admin/ustawienia/email?blad=${encodeURIComponent(
        "Poczta nie jest jeszcze skonfigurowana - uzupełnij zmienne środowiskowe na hostingu.",
      )}`,
    );
  }

  const now = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
  const result = await sendEmailDiagnostic(
    config.from,
    "Czapla Boxing - test poczty",
    `To jest testowa wiadomość z systemu Czapla Boxing.\n\n` +
      `Jeśli ją widzisz, wysyłka e-mail działa poprawnie.\n\n` +
      `Wysłano: ${now}\n` +
      `Nadawca: ${config.from}\n` +
      `Serwer: ${config.host}:${config.port}`,
  );

  if (result.ok) {
    // Wynik testu jest wart wpisu do dziennika - to zdarzenie administracyjne,
    // które warto móc odtworzyć ("kiedy ostatnio poczta na pewno działała").
    await logActivity(prisma, {
      actorUserId: session.user.id,
      action: "SETTINGS_UPDATED",
      summary: `Wysłano testowy e-mail na ${config.from} - dostarczony`,
    });
    redirect(
      `/admin/ustawienia/email?ok=${encodeURIComponent(
        `Wiadomość testowa wysłana na ${config.from}. Sprawdź skrzynkę (także folder spam).`,
      )}`,
    );
  }

  await logActivity(prisma, {
    actorUserId: session.user.id,
    action: "SETTINGS_UPDATED",
    summary: `Test e-mail na ${config.from} nie powiódł się: ${result.error}`,
  });
  redirect(`/admin/ustawienia/email?blad=${encodeURIComponent(result.error)}`);
}
