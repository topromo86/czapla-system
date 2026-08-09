import "server-only";

import { prisma } from "@/lib/prisma";
import {
  INDIVIDUAL_HORIZON_DAYS,
  type AvailabilityWindowLike,
  type BusyInterval,
} from "@/lib/domain/availability";
import { effectiveTrainerId } from "@/lib/domain/substitute";

// Wejście do wyliczenia wolnych terminów - okna WSZYSTKICH trenerów i cały
// zajęty grafik klubu w horyzoncie.
//
// Dlaczego cały klub, a nie sam wybrany trener: sala jest zasobem wspólnym.
// Żeby stwierdzić, czy Adam może przyjąć w Mikołowie o 17:00, trzeba wiedzieć,
// co o 17:00 dzieje się w Mikołowie u pozostałych - łącznie z zajęciami
// grupowymi. Zapytanie o jednego trenera tego nie pokaże.
export async function loadClubAvailability(now: Date): Promise<{
  windows: AvailabilityWindowLike[];
  busy: BusyInterval[];
}> {
  // Dzień zapasu, bo horyzont liczy się w dniach kalendarzowych, a ostatni
  // slot dnia kończy się wieczorem.
  const horizonEnd = new Date(now.getTime() + (INDIVIDUAL_HORIZON_DAYS + 1) * 86_400_000);

  const [windows, sessions] = await Promise.all([
    prisma.availabilityWindow.findMany({
      where: { active: true, trainer: { active: true } },
      select: {
        id: true,
        trainerId: true,
        locationId: true,
        weekday: true,
        startTime: true,
        endTime: true,
        slotMinutes: true,
      },
    }),
    // Zajęcia grupowe i indywidualne razem - jedne i drugie zajmują salę.
    // `endsAt > now` zamiast `startsAt >= now`: trening trwający w tej chwili
    // nadal blokuje salę do swojego końca.
    prisma.session.findMany({
      where: {
        status: { not: "CANCELLED" },
        endsAt: { gt: now },
        startsAt: { lte: horizonEnd },
      },
      select: {
        trainerId: true,
        substituteTrainerId: true,
        substituteStatus: true,
        locationId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  return {
    windows,
    busy: sessions.map((s) => ({
      // Przy przyjętym zastępstwie w sali stoi zastępca, a trener pierwotny
      // jest wolny - blokujemy tego, kto naprawdę prowadzi.
      trainerId: effectiveTrainerId(s),
      locationId: s.locationId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    })),
  };
}
