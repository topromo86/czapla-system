"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, getAccessibleMembers } from "@/lib/auth/guard";
import { parsePreferenceForm } from "@/lib/domain/notification";
import { savePreferences } from "@/lib/services/notification";

// Subskrypcja Web Push (obiekt PushSubscription z przeglądarki) - patrz
// public/sw.js. Wcześniej siedziała pod "Moje dziecko" i była dostępna
// wyłącznie dla opiekunów; teraz push dotyczy każdego, kto chce dostawać
// przypomnienia, więc mieszka razem z resztą ustawień powiadomień.
export async function savePushSubscriptionAction(subscriptionJson: string) {
  const session = await requireSession();
  const subscription = JSON.parse(subscriptionJson);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: subscription },
  });
  revalidatePath("/app/powiadomienia");
}

export async function clearPushSubscriptionAction() {
  const session = await requireSession();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: Prisma.DbNull },
  });
  revalidatePath("/app/powiadomienia");
}

export async function saveNotificationPreferencesAction(formData: FormData) {
  const session = await requireSession();

  // O tym, czy widać przełącznik "wejście dziecka", decyduje serwer na
  // podstawie realnych podopiecznych - nie ukryte pole z formularza.
  const members = await getAccessibleMembers();
  const isGuardian = session.user.role === "GUARDIAN" || members.some((m) => m.isMinor);

  const selected = formData.getAll("pref").map(String);
  const prefs = parsePreferenceForm(selected, isGuardian);

  await savePreferences(prisma, session.user.id, prefs);

  revalidatePath("/app/powiadomienia");
  redirect("/app/powiadomienia?zapisano=1");
}
