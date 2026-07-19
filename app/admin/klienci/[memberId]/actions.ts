"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { calculateAge } from "@/lib/domain/booking";
import { logActivity } from "@/lib/services/activity";
import { Prisma } from "@/app/generated/prisma/client";
import type { MemberLevel, MemberStatus, Sex } from "@/app/generated/prisma/client";

const LEVELS: readonly MemberLevel[] = ["WHITE", "YELLOW", "ORANGE", "GREEN"];
const STATUSES: readonly MemberStatus[] = ["ACTIVE", "FROZEN", "CHURNED"];

// Korekta danych klienta przez admina (literówki, zmiana trenera-opiekuna,
// przeniesienie lokalizacji domowej itp.) - osobno od zamrożenia karnetu
// (Pass.status), które ma własną akcję. Zmiana MemberStatus na CHURNED/z
// powrotem pilnuje churnedAt, tak jak zrobiłby to job (SPEC.md sekcja 1).
export async function updateMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const birthDateStr = String(formData.get("birthDate") ?? "");
  const sex = String(formData.get("sex") ?? "");
  const weightKgRaw = formData.get("weightKg");
  const goal = String(formData.get("goal") ?? "").trim();
  const level = String(formData.get("level") ?? "");
  const status = String(formData.get("status") ?? "");
  const homeLocationId = String(formData.get("homeLocationId") ?? "");
  const ownerTrainerId = String(formData.get("ownerTrainerId") ?? "");

  if (!firstName || !lastName || !birthDateStr || !homeLocationId || !ownerTrainerId) {
    throw new Error("Uzupełnij wszystkie wymagane pola.");
  }
  if (sex !== "MALE" && sex !== "FEMALE") {
    throw new Error("Nieprawidłowa płeć.");
  }
  if (!LEVELS.includes(level as MemberLevel)) {
    throw new Error("Nieprawidłowy poziom.");
  }
  if (!STATUSES.includes(status as MemberStatus)) {
    throw new Error("Nieprawidłowy status.");
  }

  const birthDate = new Date(birthDateStr);
  const now = new Date();
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) {
    throw new Error("Nieprawidłowa data urodzenia.");
  }
  const isMinor = calculateAge(birthDate, now) < 18;
  const weightKg = weightKgRaw && String(weightKgRaw).length > 0 ? Number(weightKgRaw) : null;

  const before = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        firstName,
        lastName,
        birthDate,
        isMinor,
        sex: sex as Sex,
        weightKg,
        goal: goal || null,
        level: level as MemberLevel,
        status: status as MemberStatus,
        homeLocationId,
        ownerTrainerId,
        churnedAt:
          status === "CHURNED"
            ? (before.churnedAt ?? now)
            : before.status === "CHURNED"
              ? null
              : before.churnedAt,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "MEMBER_UPDATED",
      memberId,
      summary: `Zaktualizowano dane klienta ${firstName} ${lastName}`,
    });
  });

  redirect(`/admin/klienci/${memberId}`);
}

// Ręczne oznaczenie nagrody za polecenie jako przyznanej (rabat/prezent
// wydany poza systemem - brak automatycznego mechanizmu kuponów na Payment).
export async function markReferralRewardedAction(formData: FormData) {
  await requireRole("ADMIN");
  const referralId = String(formData.get("referralId"));
  const memberId = String(formData.get("memberId"));

  const referral = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
  if (referral.status !== "CONVERTED") {
    throw new Error("Nagrodę można przyznać tylko po zrealizowanym poleceniu.");
  }

  await prisma.referral.update({
    where: { id: referralId },
    data: { status: "REWARDED", rewardedAt: new Date() },
  });

  revalidatePath(`/admin/klienci/${memberId}`);
}

// RODO - prawo do bycia zapomnianym. Czyści dane IDENTYFIKUJĄCE (imię,
// nazwisko, kontakt, cel, waga), ale NIE usuwa rekordów finansowych
// (Payment/Pass) ani obecności - te są już niezależne od danych osobowych
// (referencja przez memberId, nie przez nazwisko) i klub ma prawny obowiązek
// je zachować do celów księgowych. ❗️ Nie czyści historycznych wpisów w
// ActivityLog ani treści Note - te opisują działania klubu, nie samego
// klienta, i mogą wciąż zawierać stare imię w treści (patrz PLAN.md Faza 6).
export async function anonymizeMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const memberId = String(formData.get("memberId"));
  const confirmed = formData.get("confirmed");
  if (confirmed !== "on") {
    throw new Error("Potwierdź żądanie usunięcia danych.");
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        firstName: "Klient",
        lastName: "Usunięty",
        goal: null,
        weightKg: null,
        sex: null,
      },
    });

    if (member.userId) {
      await tx.user.update({
        where: { id: member.userId },
        data: {
          name: "Klient usunięty",
          email: `usuniety-${memberId}@anonimizowany.local`,
          phone: null,
          passwordHash: null,
          pushSubscription: Prisma.DbNull,
        },
      });
    }

    await tx.consent.updateMany({
      where: { memberId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "MEMBER_UPDATED",
      memberId,
      summary: "Zanonimizowano dane osobowe klienta na żądanie RODO",
    });
  });

  redirect(`/admin/klienci/${memberId}`);
}
