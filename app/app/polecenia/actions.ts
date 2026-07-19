"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { createReferralCode } from "@/lib/services/referral";

export async function generateReferralCodeAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  await requireMemberAccess(memberId);

  await prisma.$transaction((tx) => createReferralCode(tx, memberId));

  revalidatePath("/app/polecenia");
}
