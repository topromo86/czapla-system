import type { PrismaClient } from "@/app/generated/prisma/client";
import { resolveClassName } from "@/lib/domain/class-template";
import {
  addCalendarDays,
  calendarWeekday,
  todayInTimeZone,
  zonedTimeToUtc,
} from "@/lib/domain/time";

const WEEKS_AHEAD = 8;

export type GenerateSessionsResult = { templatesProcessed: number; sessionsUpserted: number };

// SPEC.md sekcja 4: generuje Session z ClassTemplate na 8 tygodni do przodu.
// Idempotentny dzięki unikalnemu (templateId, startsAt) - uruchomienie dwa razy
// tego samego dnia nie tworzy duplikatów ani nie nadpisuje istniejących sesji.
export async function generateSessions(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<GenerateSessionsResult> {
  // Kategorię dołączamy, bo z niej bierze się nazwa zajęć bez własnej nazwy
  // (resolveClassName) oraz categoryId sesji - inaczej sesje z planu byłyby bez
  // rodzaju i wypadały z filtra na grafiku klienta.
  const templates = await prisma.classTemplate.findMany({
    where: { active: true },
    include: { category: true },
  });
  const today = todayInTimeZone(now);

  let sessionsUpserted = 0;

  for (const tpl of templates) {
    const [hour, minute] = tpl.startTime.split(":").map(Number);
    const displayName = resolveClassName(tpl.name, tpl.category?.name ?? "Zajęcia");

    for (let offset = 0; offset < WEEKS_AHEAD * 7; offset++) {
      const date = addCalendarDays(today, offset);
      if (calendarWeekday(date) !== tpl.weekday) continue;

      const startsAt = zonedTimeToUtc(date.year, date.month, date.day, hour, minute);
      // Plan z datą startu w przyszłości nie generuje sesji sprzed nią. startDate
      // to północ dnia startu, więc każde zajęcia tego dnia (o dowolnej godzinie)
      // przechodzą, a wcześniejsze odpadają.
      if (tpl.startDate && startsAt < tpl.startDate) continue;
      const endsAt = new Date(startsAt.getTime() + tpl.durationMin * 60_000);

      await prisma.session.upsert({
        where: { templateId_startsAt: { templateId: tpl.id, startsAt } },
        update: {},
        create: {
          templateId: tpl.id,
          locationId: tpl.locationId,
          trainerId: tpl.trainerId,
          categoryId: tpl.categoryId,
          name: displayName,
          startsAt,
          endsAt,
          capacity: tpl.capacity,
        },
      });
      sessionsUpserted++;
    }
  }

  return { templatesProcessed: templates.length, sessionsUpserted };
}
