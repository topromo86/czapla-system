"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { describePlan, PLAN_ERROR_MESSAGE, validatePlan } from "@/lib/domain/plan";
import { logActivity } from "@/lib/services/activity";

// Cennik klubu w rękach właściciela. Dotąd rodzaje karnetów siedziały w seedzie
// i zmiana ceny wymagała programisty - a ceny zmieniają się częściej niż kod.

function back(error?: string): never {
  redirect(error ? `/admin/karnety?error=${encodeURIComponent(error)}` : "/admin/karnety");
}

// "249" albo "249,50" -> grosze. null, gdy to nie jest kwota.
function zlToGrosze(raw: string): number | null {
  const trimmed = raw.replace(",", ".").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Ważność: gotowy okres z listy albo własna liczba dni, gdy klub wymyśli
// karnet wakacyjny. Wpisana liczba wygrywa z listą.
function readDuration(formData: FormData): number {
  const custom = String(formData.get("customDays") ?? "").trim();
  if (custom) return Number(custom);
  return Number(formData.get("durationDays"));
}

function readForm(formData: FormData) {
  const rawEntries = String(formData.get("entriesPerMonth") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    // Pusta cena to nie zero - to znaczy, że ktoś nic nie wpisał. NaN wpadnie
    // w walidację i wróci komunikatem zamiast zapisać karnet za darmo.
    priceGross: zlToGrosze(String(formData.get("price") ?? "")) ?? Number.NaN,
    durationDays: readDuration(formData),
    // Puste = OPEN, czyli karnet bez limitu wejść.
    entriesPerMonth: rawEntries ? Number(rawEntries) : null,
    forMinors: formData.get("forMinors") === "on",
    // Karnet na treningi indywidualne - decyduje, z którego karnetu zejdzie
    // wejście, gdy klient ma naraz grupowy i indywidualny.
    forIndividual: formData.get("forIndividual") === "on",
  };
}

export async function createPlanAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = readForm(formData);

  const invalid = validatePlan(input);
  if (invalid) back(PLAN_ERROR_MESSAGE[invalid]);

  await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({ data: input });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "PLAN_CHANGED",
      summary: `Dodano rodzaj karnetu "${plan.name}" (${describePlan(plan)})`,
    });
  });

  revalidatePath("/admin/karnety");
  revalidatePath("/trainer/kasa");
  revalidatePath("/admin/wplaty");
  back();
}

export async function updatePlanAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const planId = String(formData.get("planId") ?? "");
  const input = readForm(formData);

  const invalid = validatePlan(input);
  if (invalid) back(PLAN_ERROR_MESSAGE[invalid]);

  const before = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });

  await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.update({ where: { id: planId }, data: input });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "PLAN_CHANGED",
      summary: `Zmieniono karnet "${plan.name}": ${describePlan(before)} → ${describePlan(plan)}`,
    });
  });

  // Zmiana ceny NIE rusza już sprzedanych karnetów - klient płaci to, co było
  // uzgodnione przy sprzedaży (Pass.priceGross). Cennik dotyczy przyszłości.
  revalidatePath("/admin/karnety");
  revalidatePath("/trainer/kasa");
  revalidatePath("/admin/wplaty");
  back();
}

// Wycofanie ze sprzedaży. Karnet znika z kasy, ale zostaje w historii i na
// kartach klientów, którzy go mają.
export async function togglePlanActiveAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const planId = String(formData.get("planId") ?? "");

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });

  await prisma.$transaction(async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: { active: !plan.active } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "PLAN_CHANGED",
      summary: plan.active
        ? `Wycofano karnet "${plan.name}" ze sprzedaży`
        : `Przywrócono karnet "${plan.name}" do sprzedaży`,
    });
  });

  revalidatePath("/admin/karnety");
  revalidatePath("/trainer/kasa");
  revalidatePath("/admin/wplaty");
  back();
}

export async function deletePlanAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const planId = String(formData.get("planId") ?? "");

  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    include: { _count: { select: { passes: true } } },
  });

  // Karnet, który ktoś kupił, jest częścią historii klubu - kasowanie go
  // zabrałoby dane sprzedaży i zostawiło karty klientów bez nazwy planu.
  // Baza i tak by na to nie pozwoliła (onDelete: Restrict); tutaj mówimy
  // właścicielowi, co zrobić zamiast tego.
  if (plan._count.passes > 0) {
    back(
      `Karnet "${plan.name}" był już sprzedany ${plan._count.passes} raz(y), więc nie da się go usunąć. Wycofaj go ze sprzedaży - zniknie z kasy, a historia zostanie.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.plan.delete({ where: { id: planId } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "PLAN_CHANGED",
      summary: `Usunięto rodzaj karnetu "${plan.name}"`,
    });
  });

  revalidatePath("/admin/karnety");
  revalidatePath("/trainer/kasa");
  revalidatePath("/admin/wplaty");
  back();
}
