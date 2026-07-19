import "server-only";
import webpush, { type PushSubscription } from "web-push";

const vapidConfigured = Boolean(
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
);

if (vapidConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:kontakt@czaplaboxing.pl",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

// Web Push nie wymaga żadnego konta zewnętrznego (VAPID to protokół
// self-hostowany) - działa od razu. Zwraca false zamiast rzucać, żeby
// wywołujący mógł spokojnie spróbować fallbacku SMS.
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string },
): Promise<boolean> {
  if (!vapidConfigured) {
    console.warn("[push] Brak skonfigurowanych kluczy VAPID - powiadomienie nie wysłane.");
    return false;
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

// Brak realnego dostawcy SMS (Twilio/Vonage itp., patrz PLAN.md Faza 4) -
// to wymaga płatnego konta, którego nikt jeszcze nie założył. Funkcja tylko
// loguje próbę i zwraca false, żeby ekran ustawień mógł uczciwie pokazać
// "SMS nieaktywny", zamiast udawać, że wiadomość poszła.
export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!process.env.SMS_PROVIDER_API_KEY) {
    console.warn(`[sms] Brak skonfigurowanego dostawcy - nie wysłano do ${phone}: ${message}`);
    return false;
  }
  // TODO: podłącz realnego dostawcę SMS po założeniu konta.
  return false;
}

// Powiadomienie "dziecko weszło na salę" (SPEC.md sekcja 3: "najwyżej
// oceniana funkcja w zajęciach dziecięcych"). Push jako główny kanał, SMS
// wyłącznie jako fallback gdy push zawiedzie i klient ma go włączonego.
export async function notifyGuardianCheckIn(
  guardian: {
    phone: string | null;
    pushSubscription: unknown;
    checkInNotifyPush: boolean;
    checkInNotifySms: boolean;
  },
  memberName: string,
): Promise<void> {
  const payload = {
    title: "Czapla Boxing",
    body: `${memberName} właśnie zameldował(a) się na sali.`,
  };

  let pushSent = false;
  if (guardian.checkInNotifyPush && guardian.pushSubscription) {
    pushSent = await sendPushNotification(
      guardian.pushSubscription as PushSubscription,
      payload,
    );
  }

  if (!pushSent && guardian.checkInNotifySms && guardian.phone) {
    await sendSms(guardian.phone, `${payload.title}: ${payload.body}`);
  }
}
