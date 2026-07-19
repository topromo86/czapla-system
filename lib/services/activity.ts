import "server-only";
import { Prisma, type PrismaClient, type ActivityAction } from "@/app/generated/prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

// Jedno miejsce zapisu do historii aktywności (kto co zrobił) - admin widzi
// wszystkich, trener wyłącznie siebie. Patrz /admin/aktywnosc, /trainer/aktywnosc.
export async function logActivity(
  tx: Tx,
  params: { actorUserId: string; action: ActivityAction; memberId?: string; summary: string },
) {
  await tx.activityLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      memberId: params.memberId ?? null,
      summary: params.summary,
    },
  });
}
