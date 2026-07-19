"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { calculateAge } from "@/lib/domain/booking";
import { logActivity } from "@/lib/services/activity";
import { registerReferralIfCodeProvided } from "@/lib/services/referral";
import type { Sex } from "@/app/generated/prisma/client";

// CLAUDE.md reguła 1: każdy klient ma jednego trenera-opiekuna - konkretna
// osoba, nie "grupa". ownerTrainerId jest tu obowiązkowe (required w formularzu
// i w schemacie). joinedAt NIE jest ustawiane tutaj - SPEC.md sekcja 1:
// to pierwsza opłacona transakcja lub pierwsza obecność, patrz
// lib/services/member.ts#markJoinedIfNeeded.
export async function createMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const birthDateStr = String(formData.get("birthDate") ?? "");
  const sex = String(formData.get("sex") ?? "");
  const weightKgRaw = formData.get("weightKg");
  const goal = String(formData.get("goal") ?? "").trim();
  const homeLocationId = String(formData.get("homeLocationId") ?? "");
  const ownerTrainerId = String(formData.get("ownerTrainerId") ?? "");
  const referralCode = String(formData.get("referralCode") ?? "")
    .trim()
    .toUpperCase();

  if (!firstName || !lastName || !birthDateStr || !homeLocationId || !ownerTrainerId) {
    throw new Error("Uzupełnij wszystkie wymagane pola.");
  }
  if (sex !== "MALE" && sex !== "FEMALE") {
    throw new Error("Nieprawidłowa płeć.");
  }

  const birthDate = new Date(birthDateStr);
  const now = new Date();
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) {
    throw new Error("Nieprawidłowa data urodzenia.");
  }
  const isMinor = calculateAge(birthDate, now) < 18;
  const weightKg = weightKgRaw && String(weightKgRaw).length > 0 ? Number(weightKgRaw) : null;

  await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        firstName,
        lastName,
        birthDate,
        isMinor,
        sex: sex as Sex,
        weightKg,
        goal: goal || null,
        homeLocationId,
        ownerTrainerId,
        joinedAt: null,
      },
    });

    // Kod polecenia (Faza 6): jeśli aktywny, nowy klient trafia do TEGO SAMEGO
    // trenera-opiekuna co polecający - "przypisanie do opiekuna" z checklisty.
    let referralNote = "";
    if (referralCode) {
      const referral = await registerReferralIfCodeProvided(tx, referralCode, member.id);
      if (referral) {
        await tx.member.update({
          where: { id: member.id },
          data: { ownerTrainerId: referral.referrerOwnerTrainerId },
        });
        referralNote = ` (polecenie: ${referralCode})`;
      }
    }

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "MEMBER_CREATED",
      memberId: member.id,
      summary: `Dodano klienta ${firstName} ${lastName}${referralNote}`,
    });
  });

  redirect(`/admin?q=${encodeURIComponent(lastName)}`);
}
