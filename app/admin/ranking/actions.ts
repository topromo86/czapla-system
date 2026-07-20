"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/services/activity";
import { formatMoney } from "@/lib/format";

function back(error?: string): never {
  redirect(error ? `/admin/ranking?error=${encodeURIComponent(error)}` : "/admin/ranking");
}

// "1500", "1500,50", "1500.50" -> grosze. Kwoty wpisywane w złotych, trzymane
// w groszach (CLAUDE.md).
function parseAmountToGrosze(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const grosze = Math.round(Number(normalized) * 100);
  return Number.isFinite(grosze) && grosze >= 0 ? grosze : null;
}

export async function updateBonusSettingsAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const threshold = Number(formData.get("bonusThresholdScore"));
  const amountRaw = String(formData.get("bonusAmount") ?? "");

  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    back("Próg premii musi być liczbą całkowitą od 0 do 100.");
  }

  const bonusAmountGross = parseAmountToGrosze(amountRaw);
  if (bonusAmountGross == null) back("Podaj kwotę premii w złotych, np. 500 albo 500,50.");

  await prisma.$transaction(async (tx) => {
    await tx.clubSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", bonusThresholdScore: threshold, bonusAmountGross },
      update: { bonusThresholdScore: threshold, bonusAmountGross },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SETTINGS_UPDATED",
      summary: `Premia trenerów: próg ${threshold} pkt, kwota ${formatMoney(bonusAmountGross)}`,
    });
  });

  revalidatePath("/admin/ranking");
  revalidatePath("/admin/wynagrodzenia");
  revalidatePath("/trainer/wynagrodzenie");
  revalidatePath("/trainer/karta");
  back();
}
