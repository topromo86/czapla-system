import "server-only";
import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  wantsNotification,
  type NotificationType,
  type StoredPreference,
} from "@/lib/domain/notification";
import { sendPushNotification, sendSms } from "@/lib/services/notify";

type Db = PrismaClient | Prisma.TransactionClient;

export async function getPreferences(userId: string): Promise<StoredPreference[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { type: true, push: true, sms: true },
  });
  return rows as StoredPreference[];
}

// Zapis całego kompletu naraz. Upsert per typ, bo brak wiersza znaczy
// "wartość domyślna" - a po świadomym wyłączeniu przez klienta musi znaczyć
// "wyłączone", nie "domyślnie włączone".
export async function savePreferences(
  db: Db,
  userId: string,
  prefs: readonly StoredPreference[],
): Promise<void> {
  for (const pref of prefs) {
    await db.notificationPreference.upsert({
      where: { userId_type: { userId, type: pref.type } },
      create: { userId, type: pref.type, push: pref.push, sms: pref.sms },
      update: { push: pref.push, sms: pref.sms },
    });
  }
}

export type NotifyResult = "SENT" | "SKIPPED_PREFERENCE" | "SKIPPED_DUPLICATE" | "NO_CHANNEL";

// Jedno wejście dla wszystkich powiadomień do użytkownika.
//
// `subjectId` służy idempotencji: ten sam (user, typ, subject) nie zostanie
// wysłany drugi raz. Bez tego codzienny cron przypominałby o tych samych
// zajęciach każdego dnia aż do ich rozpoczęcia.
export async function notify(input: {
  userId: string;
  type: NotificationType;
  subjectId: string;
  title: string;
  body: string;
}): Promise<NotifyResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { phone: true, pushSubscription: true },
  });
  if (!user) return "NO_CHANNEL";

  const prefs = await getPreferences(input.userId);

  const wantsPush = wantsNotification(prefs, input.type, "PUSH");
  const wantsSms = wantsNotification(prefs, input.type, "SMS");
  if (!wantsPush && !wantsSms) return "SKIPPED_PREFERENCE";

  // Rezerwujemy wpis PRZED wysyłką. Przy równoległym uruchomieniu dwóch
  // instancji cronu druga dostanie błąd unikalności i nie wyśle duplikatu.
  let reservation;
  try {
    reservation = await prisma.notificationLog.create({
      data: { userId: input.userId, type: input.type, subjectId: input.subjectId },
    });
  } catch {
    return "SKIPPED_DUPLICATE";
  }

  let sent = false;
  if (wantsPush && user.pushSubscription) {
    sent = await sendPushNotification(user.pushSubscription as never, {
      title: input.title,
      body: input.body,
    });
  }

  // SMS wyłącznie jako ratunek, gdy push nie doszedł - a nie jako drugi
  // egzemplarz tej samej wiadomości.
  if (!sent && wantsSms && user.phone) {
    sent = await sendSms(user.phone, `${input.title}: ${input.body}`);
  }

  // Nic nie poszło - zwalniamy rezerwację, żeby kolejne uruchomienie mogło
  // spróbować ponownie. Dziennik ma odzwierciedlać to, co realnie wysłano;
  // gdyby wpis został, chwilowa awaria push kasowałaby powiadomienie na stałe.
  if (!sent) {
    await prisma.notificationLog.delete({ where: { id: reservation.id } });
    return "NO_CHANNEL";
  }

  return "SENT";
}
