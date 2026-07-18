import type { PrismaClient } from "@/app/generated/prisma/client";
import { classifyInactivityAlert, daysSince } from "@/lib/domain/retention";

export type DetectInactiveResult = { membersChecked: number; tasksCreated: number };

// SPEC.md sekcja 2 "Alerty retencyjne": 7 dni bez treningu = zadanie dla
// trenera, 14 dni = eskalacja. Liczone od ostatniej obecności (dowolna
// metoda), nie od ostatniej rezerwacji (CLAUDE.md reguła 10). Idempotentny -
// nie tworzy drugiego otwartego zadania tego samego typu dla tego samego
// klienta.
export async function detectInactive(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DetectInactiveResult> {
  const activeMembers = await prisma.member.findMany({
    where: { status: "ACTIVE", joinedAt: { not: null } },
    include: {
      attendances: { orderBy: { checkedInAt: "desc" }, take: 1 },
    },
  });

  let tasksCreated = 0;

  for (const member of activeMembers) {
    const lastAttendance = member.attendances[0]?.checkedInAt ?? null;
    const alertType = classifyInactivityAlert(daysSince(lastAttendance, now));
    if (!alertType) continue;

    const existingOpen = await prisma.retentionTask.findFirst({
      where: { memberId: member.id, type: alertType, closedAt: null },
    });
    if (existingOpen) continue;

    await prisma.retentionTask.create({
      data: {
        memberId: member.id,
        trainerId: member.ownerTrainerId,
        type: alertType,
        dueAt: now,
        escalatedAt: alertType === "INACTIVE_14" ? now : null,
      },
    });
    tasksCreated++;
  }

  return { membersChecked: activeMembers.length, tasksCreated };
}
