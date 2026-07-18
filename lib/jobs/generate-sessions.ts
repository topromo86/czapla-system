import type { PrismaClient } from "@/app/generated/prisma/client";
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
  const templates = await prisma.classTemplate.findMany({ where: { active: true } });
  const today = todayInTimeZone(now);

  let sessionsUpserted = 0;

  for (const tpl of templates) {
    const [hour, minute] = tpl.startTime.split(":").map(Number);

    for (let offset = 0; offset < WEEKS_AHEAD * 7; offset++) {
      const date = addCalendarDays(today, offset);
      if (calendarWeekday(date) !== tpl.weekday) continue;

      const startsAt = zonedTimeToUtc(date.year, date.month, date.day, hour, minute);
      const endsAt = new Date(startsAt.getTime() + tpl.durationMin * 60_000);

      await prisma.session.upsert({
        where: { templateId_startsAt: { templateId: tpl.id, startsAt } },
        update: {},
        create: {
          templateId: tpl.id,
          locationId: tpl.locationId,
          trainerId: tpl.trainerId,
          name: tpl.name,
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
