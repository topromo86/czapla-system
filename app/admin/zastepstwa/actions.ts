"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { validateAssignment, type AssignSubstituteError } from "@/lib/domain/substitute";
import { logActivity } from "@/lib/services/activity";
import { notifyAdminsAboutSubstitute, notifySubstituteRequested } from "@/lib/services/substitute";
import { formatDayTime } from "@/lib/format";

const ERROR_MESSAGE: Record<AssignSubstituteError, string> = {
  SAME_TRAINER: "To jest trener prowadzący te zajęcia.",
  SESSION_CANCELLED: "Te zajęcia są odwołane.",
  SESSION_STARTED: "Te zajęcia już się zaczęły.",
  ALREADY_ACCEPTED: "", // właściciel może nadpisać - nigdy tu nie trafi
};

function back(error?: string): never {
  redirect(error ? `/admin/zastepstwa?error=${encodeURIComponent(error)}` : "/admin/zastepstwa");
}

// Właściciel przydziela zastępstwo dowolnie - także nadpisując potwierdzone.
// Zastępca i tak musi je przyjąć do wiadomości, żeby nikt nie tłumaczył się
// potem, że nie wiedział.
export async function adminAssignSubstituteAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const sessionId = String(formData.get("sessionId"));
  const substituteTrainerId = String(formData.get("substituteTrainerId") ?? "");

  const target = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      name: true,
      startsAt: true,
      status: true,
      trainerId: true,
      substituteStatus: true,
      substituteTrainerId: true,
      trainer: { select: { user: { select: { name: true } } } },
    },
  });

  // Pusta wartość = zdjęcie zastępstwa.
  if (!substituteTrainerId) {
    const previous = target.substituteTrainerId
      ? await prisma.trainer.findUnique({
          where: { id: target.substituteTrainerId },
          select: { user: { select: { name: true } } },
        })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          substituteTrainerId: null,
          substituteStatus: null,
          substituteRequestedAt: null,
          substituteRespondedAt: null,
          substituteRequestedById: null,
          substituteByAdmin: false,
          substituteDeclineReason: null,
        },
      });
      await logActivity(tx, {
        actorUserId: session.user.id,
        action: "SUBSTITUTE_CANCELLED",
        summary: `Właściciel zdjął zastępstwo (${previous?.user.name ?? "trener"}) z "${target.name}" ${formatDayTime(target.startsAt)}`,
      });
    });

    revalidatePath("/admin/zastepstwa");
    revalidatePath("/trainer");
    back();
  }

  const check = validateAssignment({
    trainerId: target.trainerId,
    candidateId: substituteTrainerId,
    status: target.substituteStatus,
    sessionStatus: target.status,
    startsAt: target.startsAt,
    now: new Date(),
    byAdmin: true,
  });
  if (!check.ok) back(ERROR_MESSAGE[check.error]);

  const substitute = await prisma.trainer.findUniqueOrThrow({
    where: { id: substituteTrainerId },
    select: { userId: true, user: { select: { name: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: {
        substituteTrainerId,
        substituteStatus: "PENDING",
        substituteRequestedAt: new Date(),
        substituteRespondedAt: null,
        substituteRequestedById: session.user.id,
        substituteByAdmin: true,
        substituteDeclineReason: null,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SUBSTITUTE_REQUESTED",
      summary: `Właściciel wyznaczył ${substitute.user.name} na zastępstwo za ${target.trainer.user.name} na "${target.name}" ${formatDayTime(target.startsAt)}`,
    });
  });

  await notifySubstituteRequested({
    substituteUserId: substitute.userId,
    session: { id: sessionId, name: target.name, startsAt: target.startsAt },
    requestedByName: session.user.name ?? "Właściciel",
    byAdmin: true,
  });
  await notifyAdminsAboutSubstitute({
    title: "Wyznaczono zastępstwo",
    body: `${substitute.user.name} zastąpi ${target.trainer.user.name} na "${target.name}" ${formatDayTime(target.startsAt)} - czeka na przyjęcie do wiadomości.`,
  });

  revalidatePath("/admin/zastepstwa");
  revalidatePath("/trainer");
  back();
}
