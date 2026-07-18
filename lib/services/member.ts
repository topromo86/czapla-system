import "server-only";
import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

// SPEC.md sekcja 1: joinedAt to pierwsza opłacona transakcja lub pierwsza
// obecność - NIE data założenia konta. Ustawiane raz - jeśli już jest,
// nigdy nie nadpisujemy (musi być jedna definicja, od niej liczy się cała
// retencja). Dopiero w tym momencie generujemy 3 etapy onboardingu.
export async function markJoinedIfNeeded(tx: Tx, memberId: string, when: Date) {
  const member = await tx.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { joinedAt: true },
  });
  if (member.joinedAt) return;

  await tx.member.update({ where: { id: memberId }, data: { joinedAt: when } });

  await tx.onboardingStep.createMany({
    data: [
      { memberId, step: 1, dueAt: new Date(when.getTime() + 3 * 86_400_000) },
      { memberId, step: 2, dueAt: new Date(when.getTime() + 14 * 86_400_000) },
      { memberId, step: 3, dueAt: new Date(when.getTime() + 84 * 86_400_000) },
    ],
  });
}
