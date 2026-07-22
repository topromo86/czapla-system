import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity";

// Potwierdzenie odbioru PODPISANYCH (papierowych) zgód przez trenera/admina.
// To ono zdejmuje bramę "tylko pierwsze zajęcia" (patrz booking.ts). Idempotentne
// - powtórne potwierdzenie nic nie zmienia i nie dubluje wpisu w historii.
export async function confirmConsentDelivery(input: {
  memberId: string;
  byUserId: string;
}): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { consentsDeliveredAt: true, firstName: true, lastName: true },
  });
  if (!member || member.consentsDeliveredAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: input.memberId },
      data: { consentsDeliveredAt: new Date(), consentsConfirmedByUserId: input.byUserId },
    });
    await logActivity(tx, {
      actorUserId: input.byUserId,
      action: "MEMBER_UPDATED",
      memberId: input.memberId,
      summary: `Potwierdzono odbiór podpisanych zgód: ${member.firstName} ${member.lastName}`,
    });
  });
}
