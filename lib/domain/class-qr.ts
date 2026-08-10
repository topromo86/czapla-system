// Kod QR zajęć: kiedy się pokazuje, do kiedy wolno się nim odbić i czy trener
// zdążył.
//
// Jak to działa na sali: tablet (albo telefon leżący przy wejściu) pokazuje kod
// najbliższych zajęć. Trener i klubowicze skanują go WŁASNYM telefonem, będąc
// na miejscu. Kod jest inny dla każdych zajęć, więc zdjęcie wczorajszego ekranu
// niczego nie otworzy, a odbicie wiąże się z konkretnym treningiem, nie tylko
// z wejściem do klubu.
//
// Dlaczego trener ma osobny termin: prowadzący ma być na sali przed ludźmi.
// Odbicie po tym terminie nadal się zapisuje - inaczej zajęcia zostałyby bez
// żadnego śladu - ale jest oznaczone jako spóźnione i trafia do właściciela.

export const DEFAULT_QR_OPENS_MINUTES_BEFORE = 15;
export const DEFAULT_TRAINER_CHECK_IN_MINUTES_BEFORE = 5;

const MINUTE = 60_000;

export type QrWindow = {
  opensAt: Date;
  closesAt: Date;
};

// Okno życia kodu: od X minut przed startem do końca zajęć. Po końcu zajęć kod
// jest martwy - spóźnialski melduje się u trenera, a nie skanuje kod po czasie.
export function qrWindow(
  session: { startsAt: Date; endsAt: Date },
  opensMinutesBefore: number,
): QrWindow {
  return {
    opensAt: new Date(session.startsAt.getTime() - opensMinutesBefore * MINUTE),
    closesAt: session.endsAt,
  };
}

export function isQrOpen(
  session: { startsAt: Date; endsAt: Date },
  now: Date,
  opensMinutesBefore: number,
): boolean {
  const window = qrWindow(session, opensMinutesBefore);
  return now >= window.opensAt && now <= window.closesAt;
}

// Termin odbicia prowadzącego: tyle minut przed startem.
export function trainerDeadline(session: { startsAt: Date }, minutesBefore: number): Date {
  return new Date(session.startsAt.getTime() - minutesBefore * MINUTE);
}

export type TrainerCheckInState =
  // Odbił się w terminie.
  | "ON_TIME"
  // Odbił się, ale po terminie - właściciel to widzi.
  | "LATE"
  // Termin minął, odbicia nie ma - to jest alert dla właściciela.
  | "MISSING"
  // Termin jeszcze nie minął, odbicia jeszcze nie ma. Nic się nie stało.
  | "PENDING";

export function classifyTrainerCheckIn(input: {
  session: { startsAt: Date };
  checkedInAt: Date | null;
  now: Date;
  minutesBefore: number;
}): TrainerCheckInState {
  const deadline = trainerDeadline(input.session, input.minutesBefore);
  if (input.checkedInAt) return input.checkedInAt <= deadline ? "ON_TIME" : "LATE";
  return input.now > deadline ? "MISSING" : "PENDING";
}

export const TRAINER_CHECK_IN_LABEL: Record<TrainerCheckInState, string> = {
  ON_TIME: "Trener odbity",
  LATE: "Trener odbity po czasie",
  MISSING: "Brak odbicia trenera",
  PENDING: "Czeka na odbicie trenera",
};

export type ScanRejection =
  | "UNKNOWN_CODE"
  | "TOO_EARLY"
  | "TOO_LATE"
  | "SESSION_CANCELLED"
  | "NOT_ON_LIST"
  | "ALREADY_CHECKED_IN";

export const SCAN_REJECTION_MESSAGE: Record<ScanRejection, string> = {
  UNKNOWN_CODE: "Ten kod nie należy do żadnych zajęć. Zeskanuj kod z ekranu na sali.",
  TOO_EARLY: "Za wcześnie - kod tych zajęć jeszcze nie jest aktywny.",
  TOO_LATE: "Za późno - te zajęcia już się skończyły.",
  SESSION_CANCELLED: "Te zajęcia zostały odwołane.",
  NOT_ON_LIST: "Nie masz zapisu na te zajęcia. Zgłoś się do trenera.",
  ALREADY_CHECKED_IN: "Obecność już odbita.",
};

// Czy o tej porze wolno w ogóle użyć kodu. Osobno od tego, KTO skanuje -
// uprawnienia sprawdza warstwa wyżej.
export function checkScanTime(
  session: { startsAt: Date; endsAt: Date; status: string },
  now: Date,
  opensMinutesBefore: number,
): ScanRejection | null {
  if (session.status === "CANCELLED") return "SESSION_CANCELLED";
  const window = qrWindow(session, opensMinutesBefore);
  if (now < window.opensAt) return "TOO_EARLY";
  if (now > window.closesAt) return "TOO_LATE";
  return null;
}
