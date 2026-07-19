import "server-only";
import { prisma } from "@/lib/prisma";
import type { HandoverItem } from "@/lib/domain/trainer-handover";
import { formatDayTime } from "@/lib/format";

// Wszystko, co zostałoby bez opiekuna po wyciszeniu trenera. Jedno źródło
// prawdy dla ekranu wyciszenia i dla akcji zapisującej - inaczej ekran mógłby
// pokazać cztery pozycje, a akcja przepisać trzy.
//
// Świadomie NIE obejmuje okien dostępności na treningi indywidualne: to
// osobista dyspozycyjność ("Adam może w poniedziałki"), której nie da się
// przekazać innej osobie. Akcja wyciszenia po prostu je wyłącza.
export async function collectHandoverItems(trainerId: string): Promise<HandoverItem[]> {
  const now = new Date();

  const [members, sessions, templates, tasks] = await Promise.all([
    prisma.member.findMany({
      where: { ownerTrainerId: trainerId, status: { not: "CHURNED" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.session.findMany({
      where: { trainerId, startsAt: { gte: now }, status: { not: "CANCELLED" } },
      select: { id: true, name: true, startsAt: true, kind: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.classTemplate.findMany({
      where: { trainerId, active: true },
      select: { id: true, name: true, weekday: true, startTime: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    prisma.retentionTask.findMany({
      where: { trainerId, closedAt: null },
      select: { id: true, type: true, member: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
  const TASK_LABEL: Record<string, string> = {
    INACTIVE_7: "Brak treningu od 7 dni",
    INACTIVE_14: "Brak treningu od 14 dni",
    RENEWAL: "Kończy się karnet",
  };

  return [
    ...members.map<HandoverItem>((m) => ({
      kind: "MEMBER",
      id: m.id,
      label: `${m.firstName} ${m.lastName}`,
    })),
    ...sessions.map<HandoverItem>((s) => ({
      kind: "SESSION",
      id: s.id,
      label: s.name,
      detail: `${formatDayTime(s.startsAt)}${s.kind === "INDIVIDUAL" ? " · indywidualny" : ""}`,
    })),
    ...templates.map<HandoverItem>((t) => ({
      kind: "TEMPLATE",
      id: t.id,
      label: t.name,
      detail: `${WEEKDAYS[t.weekday] ?? "?"}, ${t.startTime} - co tydzień`,
    })),
    ...tasks.map<HandoverItem>((t) => ({
      kind: "TASK",
      id: t.id,
      label: TASK_LABEL[t.type] ?? t.type,
      detail: `${t.member.firstName} ${t.member.lastName}`,
    })),
  ];
}

// Trenerzy, na których wolno przepisać obowiązki: aktywni, bez wyciszanego.
export async function eligibleHandoverTrainers(excludeTrainerId: string) {
  return prisma.trainer.findMany({
    where: { active: true, id: { not: excludeTrainerId } },
    include: { user: true, location: true },
    orderBy: { user: { name: "asc" } },
  });
}
