import "server-only";
import { prisma } from "@/lib/prisma";
import type { BookingHorizonMode } from "@/lib/domain/schedule";

export type ClubSettingsView = {
  bookingHorizonMode: BookingHorizonMode;
  bookingHorizonDays: number;
};

// Ustawienia klubu z bezpiecznym domyślnym stanem. Wiersz "singleton" jest
// zakładany migracją, ale gdyby go zabrakło (np. baza odtworzona z częściowego
// zrzutu), apka ma działać dalej na wartościach domyślnych, a nie wywalić się
// na ekranie grafiku.
export async function getClubSettings(): Promise<ClubSettingsView> {
  const settings = await prisma.clubSettings.findUnique({ where: { id: "singleton" } });
  return {
    bookingHorizonMode: settings?.bookingHorizonMode ?? "CURRENT_WEEK",
    bookingHorizonDays: settings?.bookingHorizonDays ?? 7,
  };
}
