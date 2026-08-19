import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readThemeChoice, type ThemeChoice } from "@/lib/domain/theme";

// Motyw zapisany przy koncie zalogowanej osoby. Dla gościa (ekran logowania,
// strona pojedynczych zajęć) zwraca null - tam decyduje pamięć przeglądarki
// albo ustawienie systemu.
//
// Czytane w głównym layoucie, więc świadomie jedno malutkie zapytanie
// (jedna kolumna) i cicha obsługa błędu: gdyby baza akurat nie odpowiadała,
// aplikacja ma się otworzyć w domyślnym motywie, a nie wywalić.
export async function getAccountTheme(): Promise<ThemeChoice | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { theme: true },
    });
    return readThemeChoice(user?.theme);
  } catch {
    return null;
  }
}

export async function saveAccountTheme(userId: string, theme: ThemeChoice): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { theme } });
}
