"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activity";

const BACK = "/admin/zatwierdzenia";

function done(code: string) {
  revalidatePath(BACK);
  redirect(`${BACK}?stan=${code}`);
}

// Zatwierdzenie samodzielnie założonego konta nieletniego. Dopiero teraz może
// się zapisywać na zajęcia (booking sprawdza approvalStatus === APPROVED).
export async function approveMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, approvalStatus: true },
  });
  if (!member || member.approvalStatus !== "PENDING") done("BLAD");

  await prisma.member.update({
    where: { id: memberId },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: session.user.id,
    },
  });
  await logActivity(prisma, {
    actorUserId: session.user.id,
    action: "MEMBER_UPDATED",
    memberId,
    summary: `Zatwierdzono konto nieletniego: ${member!.firstName} ${member!.lastName}`,
  });
  done("ZATWIERDZONO");
}

// Odmowa. Konto zostaje (do wyjaśnienia z klubem), ale pozostaje zablokowane.
export async function rejectMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, approvalStatus: true },
  });
  if (!member || member.approvalStatus !== "PENDING") done("BLAD");

  await prisma.member.update({
    where: { id: memberId },
    data: {
      approvalStatus: "REJECTED",
      approvedAt: new Date(),
      approvedByUserId: session.user.id,
    },
  });
  await logActivity(prisma, {
    actorUserId: session.user.id,
    action: "MEMBER_UPDATED",
    memberId,
    summary: `Odrzucono konto nieletniego: ${member!.firstName} ${member!.lastName}`,
  });
  done("ODRZUCONO_KONTO");
}

// Zatwierdzenie prośby rodzica o wgląd w grafik dziecka - to ten krok ustawia
// Member.guardianUserId. Admin potwierdza konkretną kartotekę (memberId z
// formularza), bo to on odpowiada za poprawność powiązania danych dziecka.
export async function approveLinkAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const requestId = String(formData.get("requestId"));
  const memberId = String(formData.get("memberId"));

  const [request, member] = await Promise.all([
    prisma.guardianLinkRequest.findUnique({ where: { id: requestId } }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, guardianUserId: true },
    }),
  ]);
  if (!request || request.status !== "PENDING" || !member) done("BLAD");

  // Nie odbieramy dziecka innemu opiekunowi po cichu - jeśli ma już innego,
  // trzeba to rozwiązać ręcznie, a nie nadpisywać zatwierdzeniem prośby.
  if (member!.guardianUserId && member!.guardianUserId !== request!.requesterUserId) {
    done("MA_OPIEKUNA");
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { guardianUserId: request!.requesterUserId },
    });
    await tx.guardianLinkRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        memberId,
        resolvedAt: new Date(),
        resolvedByUserId: session.user.id,
      },
    });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "MEMBER_UPDATED",
      memberId,
      summary: `Powiązano opiekuna z kontem dziecka: ${member!.firstName} ${member!.lastName}`,
    });
  });
  done("POWIAZANO");
}

export async function rejectLinkAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const requestId = String(formData.get("requestId"));

  const request = await prisma.guardianLinkRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") done("BLAD");

  await prisma.guardianLinkRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", resolvedAt: new Date(), resolvedByUserId: session.user.id },
  });
  done("ODRZUCONO_PROSBE");
}
