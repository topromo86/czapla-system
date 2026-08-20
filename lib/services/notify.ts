import "server-only";
import webpush, { type PushSubscription } from "web-push";
import { renderEmailHtml } from "@/lib/domain/email-template";

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
export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

// Jedno miejsce odczytu konfiguracji SMTP ze środowiska. Zwraca null, gdy
// brakuje któregoś z obowiązkowych pól - reszta kodu nie musi znać nazw
// zmiennych ani powtarzać walidacji.
export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    password,
    // Gdy nadawca nie podany wprost, używamy loginu - większość hostingów i
    // tak wymaga, żeby From zgadzał się z kontem uwierzytelniającym.
    from: process.env.SMTP_FROM ?? user,
  };
}

export function isEmailConfigured(): boolean {
  return readSmtpConfig() !== null;
}

// Status pól konfiguracji na potrzeby ekranu admina. Świadomie NIE zwracamy
// wartości hasła - tylko informację, czy jest ustawione. Host, port i nadawca
// nie są tajne i pokazanie ich pomaga zweryfikować literówkę.
export type SmtpFieldStatus = {
  key: string;
  label: string;
  required: boolean;
  set: boolean;
  // Podgląd wartości; dla hasła zawsze pusty.
  value: string | null;
};

export function describeSmtpStatus(): SmtpFieldStatus[] {
  const host = process.env.SMTP_HOST ?? "";
  const port = process.env.SMTP_PORT ?? "";
  const user = process.env.SMTP_USER ?? "";
  const password = process.env.SMTP_PASSWORD ?? "";
  const from = process.env.SMTP_FROM ?? "";

  return [
    { key: "SMTP_HOST", label: "Serwer poczty", required: true, set: !!host, value: host || null },
    {
      key: "SMTP_PORT",
      label: "Port",
      required: false,
      set: !!port,
      value: port || "587 (domyślnie)",
    },
    { key: "SMTP_USER", label: "Login", required: true, set: !!user, value: user || null },
    { key: "SMTP_PASSWORD", label: "Hasło", required: true, set: !!password, value: null },
    {
      key: "SMTP_FROM",
      label: "Adres nadawcy",
      required: false,
      set: !!from,
      value: from || (user ? `${user} (użyty login)` : null),
    },
  ];
}

async function buildTransport(config: SmtpConfig) {
  // Import w środku funkcji: nodemailer jest zależnością wyłącznie serwerową
  // i nie ma powodu ciągnąć jej do bundla, gdy poczta jest nieskonfigurowana.
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 to SMTPS (szyfrowanie od pierwszego bajtu), 587 to STARTTLS.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
}

// Każdy list wychodzi w dwóch wersjach naraz: zwykły tekst i ta sama treść
// w barwach klubu (lib/domain/email-template.ts). Program pocztowy wybiera,
// co pokazać - więc czytelnik z zablokowanym HTML-em dostaje pełną treść,
// a nie pustą wiadomość. Opakowanie siedzi TUTAJ, a nie w każdym nadawcy
// z osobna: dzięki temu nowy rodzaj listu wygląda dobrze bez dopisywania
// czegokolwiek.
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  options?: { buttonLabel?: string },
): Promise<boolean> {
  const config = readSmtpConfig();
  if (!config) {
    console.warn(`[email] Brak konfiguracji SMTP - nie wysłano do ${to}: ${subject}`);
    return false;
  }

  try {
    const transporter = await buildTransport(config);
    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html: renderEmailHtml({ subject, text, buttonLabel: options?.buttonLabel }),
    });
    return true;
  } catch (error) {
    // Nie rzucamy: nieudany e-mail nie może wywrócić check-inu ani jobu.
    console.warn(`[email] Wysyłka do ${to} nie powiodła się:`, error);
    return false;
  }
}

// Wariant dla ekranu konfiguracji: zamiast połykać błąd, zwraca jego treść.
// Przy stawianiu poczty komunikat "hasło odrzucone" albo "host nieznany" jest
// dokładnie tym, czego admin potrzebuje - inaczej zostaje z samym "nie działa".
export async function sendEmailDiagnostic(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = readSmtpConfig();
  if (!config) {
    return { ok: false, error: "Brak konfiguracji SMTP - uzupełnij zmienne środowiskowe." };
  }

  try {
    const transporter = await buildTransport(config);
    // verify() sprawdza połączenie i logowanie osobno od samej wysyłki, więc
    // przy błędzie od razu wiadomo, czy problem jest w haśle, czy w treści.
    await transporter.verify();
    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html: renderEmailHtml({ subject, text }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
