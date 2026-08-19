"use server";

import { auth } from "@/auth";
import { readThemeChoice } from "@/lib/domain/theme";
import { saveAccountTheme } from "@/lib/services/theme";

// Zapis wyboru motywu przy koncie. Wołane przez przełącznik po kliknięciu.
//
// Gość (ekran logowania, strona zajęć z witryny) po prostu nic nie zapisuje -
// jego wybór zostaje w pamięci przeglądarki. Dlatego brak sesji to cisza,
// a nie błąd: przełącznik ma działać wszędzie, tylko nie wszędzie ma co
// zapamiętać na koncie.
export async function saveThemeAction(value: string): Promise<void> {
  const theme = readThemeChoice(value);
  if (!theme) return;

  const session = await auth();
  if (!session?.user?.id) return;

  await saveAccountTheme(session.user.id, theme);
}
