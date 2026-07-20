// Typy powiadomień i preferencje klienta.
//
// Zasada nadrzędna: na tej liście są wyłącznie powiadomienia, które system
// realnie wysyła. Ekran ustawień z przełącznikiem do czegoś, czego nikt nie
// nadaje, jest gorszy niż brak ekranu - klient włącza, czeka i traci zaufanie
// do całej reszty. Dodając nowy typ, dodaj najpierw nadawcę.

export type NotificationType = "SESSION_REMINDER" | "BOOKING_SUGGESTION" | "CHECK_IN";

export type NotificationChannel = "PUSH" | "SMS";

export type NotificationMeta = {
  type: NotificationType;
  label: string;
  description: string;
  // Domyślnie włączone? Przypomnienie o zajęciach, na które ktoś sam się
  // zapisał, jest oczekiwane. Sugestie zapisu to już zachęta z naszej strony,
  // więc startują wyłączone - klient sam decyduje, czy chce być zaczepiany.
  defaultPush: boolean;
  // Dotyczy tylko opiekunów (powiadomienie o dziecku).
  guardianOnly: boolean;
};

export const NOTIFICATION_TYPES: readonly NotificationMeta[] = [
  {
    type: "SESSION_REMINDER",
    label: "Przypomnienie o zajęciach",
    description: "Dzień wcześniej przypomnimy o zajęciach, na które jesteś zapisany.",
    defaultPush: true,
    guardianOnly: false,
  },
  {
    type: "BOOKING_SUGGESTION",
    label: "Propozycje zapisu",
    description: "Gdy Twój stały termin jest wolny, a nie masz na niego zapisu - podpowiemy.",
    defaultPush: false,
    guardianOnly: false,
  },
  {
    type: "CHECK_IN",
    label: "Wejście dziecka na salę",
    description: "Powiadomienie w momencie, gdy dziecko zeskanuje kod przy wejściu.",
    defaultPush: true,
    guardianOnly: true,
  },
] as const;

export function notificationMeta(type: NotificationType): NotificationMeta {
  const meta = NOTIFICATION_TYPES.find((t) => t.type === type);
  if (!meta) throw new Error(`Nieznany typ powiadomienia: ${type}`);
  return meta;
}

export function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPES.some((t) => t.type === value);
}

// Typy widoczne dla danej roli. Klient bez podopiecznych nie ma po co
// oglądać przełącznika o wejściu dziecka na salę.
export function visibleTypes(isGuardian: boolean): NotificationMeta[] {
  return NOTIFICATION_TYPES.filter((t) => !t.guardianOnly || isGuardian);
}

export type StoredPreference = {
  type: NotificationType;
  push: boolean;
  sms: boolean;
};

// Rozstrzyga, czy wysłać. Brak zapisanej preferencji = wartość domyślna, więc
// nie trzeba zakładać wierszy przy tworzeniu konta.
export function wantsNotification(
  prefs: readonly StoredPreference[],
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  const stored = prefs.find((p) => p.type === type);
  if (stored) return channel === "PUSH" ? stored.push : stored.sms;

  // SMS domyślnie nigdy - kosztuje i nikt go nie zamawiał świadomie.
  return channel === "PUSH" ? notificationMeta(type).defaultPush : false;
}

// Odczyt formularza ustawień: zaznaczone pola przychodzą jako "TYPE:CHANNEL".
export function parsePreferenceForm(
  selected: readonly string[],
  isGuardian: boolean,
): StoredPreference[] {
  const allowed = new Set(visibleTypes(isGuardian).map((t) => t.type));
  const byType = new Map<NotificationType, StoredPreference>();

  for (const meta of visibleTypes(isGuardian)) {
    byType.set(meta.type, { type: meta.type, push: false, sms: false });
  }

  for (const raw of selected) {
    const [type, channel] = raw.split(":");
    if (!isNotificationType(type)) continue;
    if (!allowed.has(type)) continue;

    const entry = byType.get(type);
    if (!entry) continue;
    if (channel === "PUSH") entry.push = true;
    if (channel === "SMS") entry.sms = true;
  }

  return [...byType.values()];
}
