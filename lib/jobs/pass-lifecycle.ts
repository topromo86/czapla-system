import type { PrismaClient } from "@/app/generated/prisma/client";

export type PassLifecycleResult = { expiredCount: number };

// SPEC.md sekcja 4 "passLifecycle": karnet ACTIVE, którego endsAt minął,
// przechodzi w EXPIRED. Zamrożone karnety są pomijane celowo - zamrożenie to
// świadoma decyzja admina, ten job jej nie unieważnia (patrz freeze/unfreeze
// w app/admin/actions.ts). Idempotentny - ponowne uruchomienie nic nie zmienia.
export async function passLifecycle(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<PassLifecycleResult> {
  const result = await prisma.pass.updateMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return { expiredCount: result.count };
}
