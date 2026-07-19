"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { Prisma } from "@/app/generated/prisma/client";

// Subskrypcja Web Push (obiekt PushSubscription z przeglądarki) - patrz
// public/sw.js (obsługa push) i notification-settings.tsx (rejestracja).
export async function savePushSubscriptionAction(subscriptionJson: string) {
  const session = await requireRole("GUARDIAN");
  const subscription = JSON.parse(subscriptionJson);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: subscription },
  });
  revalidatePath("/app/dziecko");
}

export async function clearPushSubscriptionAction() {
  const session = await requireRole("GUARDIAN");
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: Prisma.DbNull },
  });
  revalidatePath("/app/dziecko");
}

export async function updateNotificationPrefsAction(formData: FormData) {
  const session = await requireRole("GUARDIAN");
  const checkInNotifyPush = formData.get("checkInNotifyPush") === "on";
  const checkInNotifySms = formData.get("checkInNotifySms") === "on";

  await prisma.user.update({
    where: { id: session.user.id },
    data: { checkInNotifyPush, checkInNotifySms },
  });
  revalidatePath("/app/dziecko");
}
