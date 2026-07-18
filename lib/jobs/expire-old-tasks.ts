import type { PrismaClient } from "@/app/generated/prisma/client";
import { shouldEscalateTask } from "@/lib/domain/retention";

export type ExpireOldTasksResult = { tasksChecked: number; tasksEscalated: number };

// SPEC.md sekcja 4 "expireOldTasks": eskalacja zadań otwartych > 7 dni.
export async function expireOldTasks(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<ExpireOldTasksResult> {
  const openTasks = await prisma.retentionTask.findMany({
    where: { closedAt: null, escalatedAt: null },
  });

  let tasksEscalated = 0;
  for (const task of openTasks) {
    if (!shouldEscalateTask(task, now)) continue;
    await prisma.retentionTask.update({ where: { id: task.id }, data: { escalatedAt: now } });
    tasksEscalated++;
  }

  return { tasksChecked: openTasks.length, tasksEscalated };
}
