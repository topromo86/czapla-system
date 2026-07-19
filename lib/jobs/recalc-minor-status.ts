import type { PrismaClient } from "@/app/generated/prisma/client";
import { calculateAge } from "@/lib/domain/booking";

export type RecalcMinorStatusResult = { recalculatedCount: number };

// PLAN.md Faza 4: przelicza isMinor po 18. urodzinach, żeby status dorosłości
// nie musiał być sprawdzany ręcznie. Celowo nie rusza guardianUserId - odpięcie
// opiekuna to decyzja biznesowa, nie automat. Idempotentny.
export async function recalcMinorStatus(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<RecalcMinorStatusResult> {
  const candidates = await prisma.member.findMany({
    where: { isMinor: true },
    select: { id: true, birthDate: true },
  });

  let recalculatedCount = 0;
  for (const member of candidates) {
    if (calculateAge(member.birthDate, now) >= 18) {
      await prisma.member.update({ where: { id: member.id }, data: { isMinor: false } });
      recalculatedCount++;
    }
  }

  return { recalculatedCount };
}
