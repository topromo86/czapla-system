"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activity";
import { formatMoney } from "@/lib/format";

// Payment jest append-only (reguła 11 CLAUDE.md) - korekta to NOWY wpis
// wskazujący przez correctsPaymentId na oryginał, nigdy edycja ani usunięcie.
// amountGross korekty to DELTA (ujemna = zwrot, dodatnia = dopłata) - suma
// wszystkich wpisów danego klienta to jego rzeczywisty rozrachunek.
export async function correctPaymentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const paymentId = String(formData.get("paymentId"));
  const deltaZlRaw = String(formData.get("deltaZl") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const deltaZl = Number(deltaZlRaw.replace(",", "."));
  if (!Number.isFinite(deltaZl) || deltaZl === 0) {
    throw new Error("Podaj niezerową kwotę korekty (dodatnią dla dopłaty, ujemną dla zwrotu).");
  }
  if (note.length < 5) {
    throw new Error("Korekta wymaga powodu (min. 5 znaków).");
  }

  const original = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { member: true },
  });

  const deltaGross = Math.round(deltaZl * 100);

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        memberId: original.memberId,
        passId: original.passId,
        amountGross: deltaGross,
        method: original.method,
        locationId: original.locationId,
        recordedByUserId: session.user.id,
        correctsPaymentId: original.id,
        note,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "PAYMENT_CORRECTED",
      memberId: original.memberId,
      summary: `Korekta płatności ${formatMoney(original.amountGross)} dla ${original.member.firstName} ${original.member.lastName}: ${deltaGross > 0 ? "+" : ""}${formatMoney(deltaGross)} - ${note}`,
    });
  });

  revalidatePath("/admin/finanse");
}
