import "server-only";
import { prisma } from "@/lib/prisma";
import { calendarWeekday, todayInTimeZone } from "@/lib/domain/time";
import { isPassUsable } from "@/lib/domain/booking";
import {
  suggestSessions,
  type AttendedSession,
  type CandidateSession,
} from "@/lib/domain/suggestions";

const WARSAW = "Europe/Warsaw";

const hourFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: WARSAW,
  hour: "2-digit",
  hour12: false,
});

// Dzień tygodnia i godzina w czasie klubu. Numeracja dnia jest dowolna -
// istotne tylko, żeby historia i kandydaci liczyli ją tak samo, bo służy
// wyłącznie za klucz slotu.
function localParts(date: Date): { weekday: number; hour: number } {
  return {
    weekday: calendarWeekday(todayInTimeZone(date, WARSAW)),
    hour: Number(hourFormatter.format(date)),
  };
}

function categoryKey(s: { categoryId: string | null; name: string }): string {
  return s.categoryId ?? s.name;
}

export type SuggestedSession = {
  sessionId: string;
  name: string;
  startsAt: Date;
  locationName: string;
  trainerName: string;
  freeSpots: number;
  reason: string;
};

// Sugestie dla ekranu klienta. Logika wyboru siedzi w lib/domain/suggestions.ts -
// tutaj wyłącznie pobranie danych i złożenie tego, co pokazujemy.
export async function buildSuggestions(input: {
  memberId: string;
  isMinor: boolean;
  now: Date;
  horizonEnd: Date;
  limit?: number;
}): Promise<SuggestedSession[]> {
  // Bez ważnego karnetu zapis i tak zostanie odrzucony (NO_ACTIVE_PASS),
  // więc sugestia byłaby zaproszeniem w ślepy zaułek. Wyszło przy testach:
  // klient z bogatą historią, ale wygasłym karnetem, dostawał propozycje,
  // których nie dało się przyjąć.
  const activePass = await prisma.pass.findFirst({
    where: { memberId: input.memberId, status: "ACTIVE" },
    orderBy: { endsAt: "desc" },
  });
  if (!activePass || !isPassUsable(activePass, input.now)) return [];

  const attendances = await prisma.attendance.findMany({
    where: { memberId: input.memberId },
    include: { session: true },
    orderBy: { session: { startsAt: "desc" } },
    take: 100,
  });
  if (attendances.length === 0) return [];

  const candidateSessions = await prisma.session.findMany({
    where: {
      startsAt: { gt: input.now, lt: input.horizonEnd },
      status: "SCHEDULED",
      kind: "GROUP",
    },
    include: {
      location: true,
      template: true,
      category: true,
      trainer: { include: { user: true } },
      bookings: { where: { status: "BOOKED" }, select: { id: true } },
    },
  });

  // Ta sama reguła co w plannerze: grupy dziecięce widzą tylko niepełnoletni
  // i odwrotnie. Bez tego dorosły dostałby sugestię zajęć dla dzieci.
  const relevant = candidateSessions.filter((s) =>
    s.template ? s.template.isKids === input.isMinor : true,
  );

  const booked = await prisma.booking.findMany({
    where: { memberId: input.memberId, status: { in: ["BOOKED", "WAITLIST"] } },
    select: { sessionId: true },
  });

  const history: AttendedSession[] = attendances.map((a) => ({
    startsAt: a.session.startsAt,
    ...localParts(a.session.startsAt),
    categoryKey: categoryKey(a.session),
    locationId: a.session.locationId,
  }));

  const candidates: CandidateSession[] = relevant.map((s) => ({
    id: s.id,
    startsAt: s.startsAt,
    ...localParts(s.startsAt),
    categoryKey: categoryKey(s),
    locationId: s.locationId,
    freeSpots: s.capacity - s.bookings.length,
  }));

  const picked = suggestSessions({
    history,
    candidates,
    bookedSessionIds: booked.map((b) => b.sessionId),
    now: input.now,
    limit: input.limit ?? 3,
  });

  const byId = new Map(relevant.map((s) => [s.id, s]));
  return picked.flatMap((p) => {
    const s = byId.get(p.sessionId);
    if (!s) return [];
    return [
      {
        sessionId: s.id,
        name: s.name,
        startsAt: s.startsAt,
        locationName: s.location.name,
        trainerName: s.trainer.user.name,
        freeSpots: s.capacity - s.bookings.length,
        reason: p.reason,
      },
    ];
  });
}
