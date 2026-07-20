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

// Wysyłka e-mail przez SMTP. Świadomie SMTP, a nie API konkretnego dostawcy:
// działa z hostingiem klubu, z Gmailem i z każdym dostawcą transakcyjnym,
// więc wybór nie zamyka drogi do żadnego z nich.
//
// Bez kompletu zmiennych nic nie wysyłamy i mówimy o tym wprost - ekran
// ustawień pokazuje wtedy kanał jako niedostępny, zamiast udawać, że działa.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn(`[email] Brak konfiguracji SMTP - nie wysłano do ${to}: ${subject}`);
    return false;
  }

  try {
    // Import w środku funkcji: nodemailer jest zależnością wyłącznie serwerową
    // i nie ma powodu ciągnąć jej do bundla, gdy poczta jest nieskonfigurowana.
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT ?? 587);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 to SMTPS (szyfrowanie od pierwszego bajtu), 587 to STARTTLS.
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return true;
  } catch (error) {
    // Nie rzucamy: nieudany e-mail nie może wywrócić check-inu ani jobu.
    console.warn(`[email] Wysyłka do ${to} nie powiodła się:`, error);
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
// oceniana funkcja w zajęciach dziecięcych").
//
// Sama wysyłka i preferencje żyją w lib/services/notification.ts - tutaj
// zostaje wyłącznie treść. Wcześniej ta funkcja czytała własne pola z User;
// po ujednoliceniu preferencji byłaby to druga, rozjeżdżająca się ścieżka.
export async function notifyGuardianCheckIn(
  guardianUserId: string,
  memberName: string,
  // Identyfikator zdarzenia dla idempotencji - jedno wejście na te zajęcia
  // to jedno powiadomienie, nawet gdyby check-in poszedł dwa razy.
  sessionId: string,
): Promise<void> {
  const { notify } = await import("@/lib/services/notification");
  await notify({
    userId: guardianUserId,
    type: "CHECK_IN",
    subjectId: sessionId,
    title: "Czapla Boxing",
    body: `${memberName} właśnie zameldował(a) się na sali.`,
  });
}
