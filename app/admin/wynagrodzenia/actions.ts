"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { zonedTimeToUtc } from "@/lib/domain/time";
import { SESSION_KIND_LABEL, type SessionKind } from "@/lib/domain/payroll";
import { logActivity } from "@/lib/services/activity";
import { formatMoney } from "@/lib/format";

function back(month: string | null, error?: string): never {
  const query = new URLSearchParams();
  if (month) query.set("miesiac", month);
  if (error) query.set("error", error);
  const qs = query.toString();
  redirect(qs ? `/admin/wynagrodzenia?${qs}` : "/admin/wynagrodzenia");
}

// Kwoty wpisywane w złotych ("120", "120,50", "120.50"), trzymane w groszach.
// Parsowanie tutaj, a nie w komponencie - formularz może przysłać cokolwiek.
function parseAmountToGrosze(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const grosze = Math.round(Number(normalized) * 100);
  return Number.isFinite(grosze) && grosze >= 0 ? grosze : null;
}

function parseDateOnly(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function setTrainerRateAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const month = String(formData.get("month") ?? "") || null;
  const trainerId = String(formData.get("trainerId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const validFromRaw = String(formData.get("validFrom") ?? "");

  if (!trainerId) back(month, "Brak trenera.");
  if (kindRaw !== "GROUP" && kindRaw !== "INDIVIDUAL") back(month, "Nieprawidłowy rodzaj zajęć.");
  const kind = kindRaw as SessionKind;

  const amountGross = parseAmountToGrosze(amountRaw);
  if (amountGross == null) back(month, "Podaj kwotę w złotych, np. 120 albo 120,50.");

  const validFromDate = parseDateOnly(validFromRaw);
  if (!validFromDate) back(month, "Podaj datę, od której obowiązuje stawka.");

  // Stawka obowiązuje od północy czasu klubu - inaczej zajęcia z tego samego
  // ranka wpadałyby jeszcze pod starą stawkę.
  const validFrom = zonedTimeToUtc(
    validFromDate.getUTCFullYear(),
    validFromDate.getUTCMonth() + 1,
    validFromDate.getUTCDate(),
    0,
    0,
  );

  const trainer = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
    include: { user: true },
  });

  await prisma.$transaction(async (tx) => {
    // Dwie stawki tego samego rodzaju od tego samego dnia nie mają sensu -
    // druga nadpisuje pierwszą zamiast wywalać się na unikalnym indeksie.
    await tx.trainerRate.upsert({
      where: { trainerId_kind_validFrom: { trainerId, kind, validFrom } },
      create: { trainerId, kind, amountGross, validFrom },
      update: { amountGross },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "TRAINER_RATE_CHANGED",
      summary: `Stawka ${trainer.user.name} (${SESSION_KIND_LABEL[kind].toLowerCase()}): ${formatMoney(amountGross)} od ${validFromRaw}`,
    });
  });

  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/trainer/wynagrodzenie");
  back(month);
}

export async function deleteTrainerRateAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const month = String(formData.get("month") ?? "") || null;
  const rateId = String(formData.get("rateId") ?? "");

  const rate = await prisma.trainerRate.findUniqueOrThrow({
    where: { id: rateId },
    include: { trainer: { include: { user: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.trainerRate.delete({ where: { id: rateId } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "TRAINER_RATE_CHANGED",
      summary: `Usunięto stawkę ${rate.trainer.user.name} (${SESSION_KIND_LABEL[rate.kind].toLowerCase()}): ${formatMoney(rate.amountGross)}`,
    });
  });

  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/trainer/wynagrodzenie");
  back(month);
}

export async function createCostAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const month = String(formData.get("month") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const startsOnRaw = String(formData.get("startsOn") ?? "");
  const endsOnRaw = String(formData.get("endsOn") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "");

  if (name.length < 2) back(month, "Podaj nazwę kosztu.");
  if (kindRaw !== "RECURRING_MONTHLY" && kindRaw !== "ONE_OFF")
    back(month, "Wybierz rodzaj kosztu.");

  const amountGross = parseAmountToGrosze(amountRaw);
  if (amountGross == null) back(month, "Podaj kwotę w złotych, np. 3000 albo 3000,50.");

  const startsOn = parseDateOnly(startsOnRaw);
  if (!startsOn) back(month, "Podaj datę kosztu.");

  const endsOn = endsOnRaw ? parseDateOnly(endsOnRaw) : null;
  if (endsOnRaw && !endsOn) back(month, "Nieprawidłowa data zakończenia.");
  if (endsOn && endsOn < startsOn)
    back(month, "Data zakończenia nie może być wcześniejsza niż początek.");

  await prisma.$transaction(async (tx) => {
    await tx.clubCost.create({
      data: {
        name,
        amountGross,
        kind: kindRaw,
        startsOn,
        // Data końcowa ma sens tylko dla kosztu stałego.
        endsOn: kindRaw === "RECURRING_MONTHLY" ? endsOn : null,
        note: note || null,
        locationId: locationId || null,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "COST_CHANGED",
      summary: `Dodano koszt "${name}" (${formatMoney(amountGross)}, ${kindRaw === "ONE_OFF" ? "jednorazowy" : "stały miesięczny"})`,
    });
  });

  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/admin/finanse");
  back(month);
}

export async function deleteCostAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const month = String(formData.get("month") ?? "") || null;
  const costId = String(formData.get("costId") ?? "");

  const cost = await prisma.clubCost.findUniqueOrThrow({ where: { id: costId } });

  await prisma.$transaction(async (tx) => {
    await tx.clubCost.delete({ where: { id: costId } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "COST_CHANGED",
      summary: `Usunięto koszt "${cost.name}" (${formatMoney(cost.amountGross)})`,
    });
  });

  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/admin/finanse");
  back(month);
}

// Zakończenie kosztu stałego zamiast kasowania - historia poprzednich
// miesięcy zostaje nietknięta, koszt po prostu przestaje obciążać kolejne.
export async function endCostAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const month = String(formData.get("month") ?? "") || null;
  const costId = String(formData.get("costId") ?? "");
  const endsOnRaw = String(formData.get("endsOn") ?? "");

  const endsOn = parseDateOnly(endsOnRaw);
  if (!endsOn) back(month, "Podaj datę zakończenia kosztu.");

  const cost = await prisma.clubCost.findUniqueOrThrow({ where: { id: costId } });
  if (cost.kind !== "RECURRING_MONTHLY") back(month, "Tylko koszt stały można zakończyć.");
  if (endsOn < cost.startsOn)
    back(month, "Data zakończenia nie może być wcześniejsza niż początek.");

  await prisma.$transaction(async (tx) => {
    await tx.clubCost.update({ where: { id: costId }, data: { endsOn } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "COST_CHANGED",
      summary: `Zakończono koszt stały "${cost.name}" z dniem ${endsOnRaw}`,
    });
  });

  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/admin/finanse");
  back(month);
}
