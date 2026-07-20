// Zastępstwa - jedyne miejsce, w którym rozstrzygamy "kto realnie prowadzi
// te zajęcia".
//
// Reguła nadrzędna: zastępstwo obowiązuje dopiero po akceptacji. Dopóki jest
// PENDING albo zostało odrzucone, prowadzącym jest trener pierwotny. Bez tego
// niepotwierdzone zastępstwo zostawiałoby zajęcia bez nikogo odpowiedzialnego,
// a wynagrodzenie szłoby do osoby, która się nie zgodziła.
//
// Ta reguła dotyka pieniędzy (lib/services/payroll.ts) i oceny trenerów
// (lib/jobs/compute-scores.ts), więc nie wolno jej duplikować w zapytaniach.

export type SubstituteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type SessionSubstitution = {
  trainerId: string;
  substituteTrainerId: string | null;
  substituteStatus: SubstituteStatus | null;
};

// Kto prowadzi zajęcia w świetle obecnego stanu zastępstwa.
export function effectiveTrainerId(session: SessionSubstitution): string {
  if (session.substituteTrainerId && session.substituteStatus === "ACCEPTED") {
    return session.substituteTrainerId;
  }
  return session.trainerId;
}

// Warunek Prisma "zajęcia, które ten trener realnie prowadzi". Zwraca czysty
// obiekt, więc moduł zostaje bez zależności od bazy i jest testowalny.
//
// Dwa przypadki: (1) jest trenerem pierwotnym i nikt go skutecznie nie
// zastępuje, (2) jest zaakceptowanym zastępcą.
export function runsSessionWhere(trainerId: string) {
  return {
    OR: [
      {
        trainerId,
        NOT: { substituteStatus: "ACCEPTED" as const },
      },
      { substituteTrainerId: trainerId, substituteStatus: "ACCEPTED" as const },
    ],
  };
}

// Zajęcia, które trener widzi u siebie: te które prowadzi PLUS te, na które
// dostał niepotwierdzone zaproszenie. Bez drugiej części nie miałby gdzie
// kliknąć "potwierdzam".
export function seesSessionWhere(trainerId: string) {
  // Tablica celowo mutowalna (bez `as const`) - Prisma nie przyjmuje
  // readonly w filtrze `in`.
  const waiting: SubstituteStatus[] = ["PENDING", "ACCEPTED"];
  return {
    OR: [{ trainerId }, { substituteTrainerId: trainerId, substituteStatus: { in: waiting } }],
  };
}

export type SubstituteView = {
  substituteTrainerId: string | null;
  substituteStatus: SubstituteStatus | null;
  substituteByAdmin: boolean;
};

// Czy ten trener ma teraz coś do potwierdzenia na tych zajęciach.
export function awaitsResponseFrom(session: SubstituteView, trainerId: string): boolean {
  return session.substituteTrainerId === trainerId && session.substituteStatus === "PENDING";
}

// Zastępstwo od admina jest poleceniem - zastępca przyjmuje je do wiadomości,
// ale nie odrzuca. Od trenera to prośba do kolegi, więc odmowa musi być
// możliwa; inaczej "potwierdź" byłoby przyciskiem bez alternatywy.
export function canDecline(session: SubstituteView): boolean {
  return session.substituteStatus === "PENDING" && !session.substituteByAdmin;
}

export const SUBSTITUTE_STATUS_LABEL: Record<SubstituteStatus, string> = {
  PENDING: "Czeka na potwierdzenie",
  ACCEPTED: "Potwierdzone",
  DECLINED: "Odrzucone",
};

export type AssignSubstituteError =
  | "SAME_TRAINER"
  | "SESSION_CANCELLED"
  | "SESSION_STARTED"
  | "ALREADY_ACCEPTED";

// Walidacja wyznaczenia. Osobno od bazy, żeby dało się ją przetestować bez
// stawiania Postgresa.
export function validateAssignment(input: {
  trainerId: string;
  candidateId: string;
  status: SubstituteStatus | null;
  sessionStatus: string;
  startsAt: Date;
  now: Date;
  byAdmin: boolean;
}): { ok: true } | { ok: false; error: AssignSubstituteError } {
  if (input.candidateId === input.trainerId) return { ok: false, error: "SAME_TRAINER" };
  if (input.sessionStatus === "CANCELLED") return { ok: false, error: "SESSION_CANCELLED" };
  if (input.startsAt <= input.now) return { ok: false, error: "SESSION_STARTED" };

  // Potwierdzonego zastępstwa trener pierwotny już nie przestawia sam - ktoś
  // się zobowiązał i zdążył to potwierdzić. Admin może, bo to on rozstrzyga
  // spory kadrowe.
  if (input.status === "ACCEPTED" && !input.byAdmin) {
    return { ok: false, error: "ALREADY_ACCEPTED" };
  }

  return { ok: true };
}
