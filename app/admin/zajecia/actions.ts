"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import {
  findOverlappingSession,
  resolveSessionTime,
  validateWindow,
  type SessionTimeError,
  type WindowValidationError,
} from "@/lib/domain/availability";
import {
  bookingHorizonEnd,
  describeHorizon,
  FIXED_HORIZON_OPTIONS,
  type BookingHorizonMode,
} from "@/lib/domain/schedule";
import {
  FREE_CANCELLATION_WINDOW_HOURS,
  MAX_CANCELLATION_WINDOW_HOURS,
  MIN_CANCELLATION_WINDOW_HOURS,
  parseCancellationWindowHours,
} from "@/lib/domain/booking";
import { logActivity } from "@/lib/services/activity";
import { formatDayTime } from "@/lib/format";

const TIME_ERROR_MESSAGE: Record<SessionTimeError, string> = {
  INVALID_DATE: "Podaj poprawną datę.",
  INVALID_TIME: "Podaj poprawną godzinę (format GG:MM).",
  INVALID_DURATION: "Czas trwania musi być liczbą minut większą od zera.",
  IN_THE_PAST: "Termin zajęć nie może być w przeszłości.",
};

const WINDOW_ERROR_MESSAGE: Record<WindowValidationError, string> = {
  INVALID_WEEKDAY: "Wybierz dzień tygodnia.",
  INVALID_START_TIME: "Podaj poprawną godzinę rozpoczęcia.",
  INVALID_END_TIME: "Podaj poprawną godzinę zakończenia.",
  END_BEFORE_START: "Godzina zakończenia musi być późniejsza niż rozpoczęcia.",
  INVALID_SLOT_MINUTES: "Długość treningu musi być większa od zera.",
  WINDOW_SHORTER_THAN_SLOT: "Okno jest krótsze niż pojedynczy trening - nie zmieści się ani jeden termin.",
};

function backToList(error?: string): never {
  redirect(error ? `/admin/zajecia?error=${encodeURIComponent(error)}` : "/admin/zajecia");
}

// Trener nie prowadzi dwóch rzeczy naraz - sprawdzane przy dodawaniu i edycji,
// zawsze server-side. Bierze pod uwagę też treningi indywidualne, bo one
// blokują trenera dokładnie tak samo jak zajęcia grupowe.
async function assertNoTrainerConflict(
  trainerId: string,
  candidate: { startsAt: Date; endsAt: Date },
  ignoreSessionId?: string,
): Promise<string | null> {
  const sameDayStart = new Date(candidate.startsAt.getTime() - 24 * 3_600_000);
  const sameDayEnd = new Date(candidate.endsAt.getTime() + 24 * 3_600_000);

  const nearby = await prisma.session.findMany({
    where: {
      trainerId,
      status: { not: "CANCELLED" },
      startsAt: { gte: sameDayStart, lte: sameDayEnd },
    },
    select: { id: true, name: true, startsAt: true, endsAt: true },
  });

  const clash = findOverlappingSession(nearby, candidate, ignoreSessionId);
  if (!clash) return null;
  return `Trener ma już w tym czasie zajęcia: ${clash.name} (${formatDayTime(clash.startsAt)}).`;
}

export async function createSessionAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "");
  const trainerId = String(formData.get("trainerId") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const durationMin = Number(formData.get("durationMin"));
  const capacity = Number(formData.get("capacity"));
  const categoryId = String(formData.get("categoryId") ?? "");

  if (name.length < 3) backToList("Nazwa zajęć musi mieć co najmniej 3 znaki.");
  if (!locationId) backToList("Wybierz miejsce.");
  if (!trainerId) backToList("Wybierz trenera.");
  if (!categoryId) backToList("Wybierz rodzaj zajęć.");
  if (!Number.isInteger(capacity) || capacity < 1) backToList("Liczba miejsc musi być większa od zera.");

  const resolved = resolveSessionTime({ date, time, durationMin, now: new Date() });
  if ("error" in resolved) backToList(TIME_ERROR_MESSAGE[resolved.error]);

  const conflict = await assertNoTrainerConflict(trainerId, resolved);
  if (conflict) backToList(conflict);

  const trainer = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
    include: { user: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.session.create({
      data: {
        locationId,
        trainerId,
        categoryId,
        name,
        kind: "GROUP",
        startsAt: resolved.startsAt,
        endsAt: resolved.endsAt,
        capacity,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SESSION_CREATED",
      summary: `Dodano zajęcia "${name}" (${formatDayTime(resolved.startsAt)}, ${trainer.user.name})`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

export async function updateSessionAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const sessionId = String(formData.get("sessionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "");
  const trainerId = String(formData.get("trainerId") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const durationMin = Number(formData.get("durationMin"));
  const capacity = Number(formData.get("capacity"));
  const categoryId = String(formData.get("categoryId") ?? "");

  if (!sessionId) backToList("Brak identyfikatora zajęć.");
  if (!categoryId) backToList("Wybierz rodzaj zajęć.");
  if (name.length < 3) backToList("Nazwa zajęć musi mieć co najmniej 3 znaki.");
  if (!Number.isInteger(capacity) || capacity < 1) backToList("Liczba miejsc musi być większa od zera.");

  const existing = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { bookings: { where: { status: { in: ["BOOKED", "WAITLIST"] } } } },
  });

  // Zajęcia, które już się odbyły, zostawiamy w spokoju - edycja historii
  // rozjechałaby obecności i statystyki trenera.
  if (existing.startsAt <= new Date()) {
    backToList("Nie można edytować zajęć, które już się rozpoczęły.");
  }

  // Przy edycji dopuszczamy przeszłość w walidacji formatu (allowPast), ale
  // nowy termin i tak musi być w przyszłości - sprawdzone osobno niżej, żeby
  // komunikat był konkretny.
  const resolved = resolveSessionTime({ date, time, durationMin, now: new Date() });
  if ("error" in resolved) backToList(TIME_ERROR_MESSAGE[resolved.error]);

  const bookedCount = existing.bookings.filter((b) => b.status === "BOOKED").length;
  if (capacity < bookedCount) {
    backToList(`Na te zajęcia zapisanych jest już ${bookedCount} osób - nie można zmniejszyć limitu poniżej tej liczby.`);
  }

  const conflict = await assertNoTrainerConflict(trainerId, resolved, sessionId);
  if (conflict) backToList(conflict);

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: {
        name,
        locationId,
        trainerId,
        categoryId,
        startsAt: resolved.startsAt,
        endsAt: resolved.endsAt,
        capacity,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SESSION_UPDATED",
      summary: `Zmieniono zajęcia "${name}" (${formatDayTime(resolved.startsAt)})`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

export async function cancelSessionAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const sessionId = String(formData.get("sessionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) backToList("Podaj powód odwołania - klienci go zobaczą.");

  const existing = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", cancelledReason: reason },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SESSION_CANCELLED",
      summary: `Odwołano zajęcia "${existing.name}" (${formatDayTime(existing.startsAt)}): ${reason}`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

export async function createAvailabilityWindowAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const trainerId = String(formData.get("trainerId") ?? "");
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const slotMinutes = Number(formData.get("slotMinutes"));

  if (!trainerId) backToList("Wybierz trenera.");

  const invalid = validateWindow({ weekday, startTime, endTime, slotMinutes });
  if (invalid) backToList(WINDOW_ERROR_MESSAGE[invalid]);

  const trainer = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
    include: { user: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.create({
      data: {
        trainerId,
        locationId: trainer.locationId,
        weekday,
        startTime,
        endTime,
        slotMinutes,
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "AVAILABILITY_WINDOW_CHANGED",
      summary: `Dodano okno treningów indywidualnych dla ${trainer.user.name} (${startTime}-${endTime})`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app/indywidualne");
  backToList();
}

export async function deleteAvailabilityWindowAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const windowId = String(formData.get("windowId") ?? "");
  const existing = await prisma.availabilityWindow.findUniqueOrThrow({
    where: { id: windowId },
    include: { trainer: { include: { user: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.delete({ where: { id: windowId } });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "AVAILABILITY_WINDOW_CHANGED",
      summary: `Usunięto okno treningów indywidualnych dla ${existing.trainer.user.name} (${existing.startTime}-${existing.endTime})`,
    });
  });

  // Usunięcie okna nie kasuje już umówionych treningów - one są konkretnymi
  // zobowiązaniami wobec klientów, właściciel odwołuje je świadomie na liście
  // zajęć, a nie przez skasowanie reguły.
  revalidatePath("/admin/zajecia");
  revalidatePath("/app/indywidualne");
  backToList();
}

// Okno zapisów - jak daleko w przód klient widzi terminy do zapisania.
export async function updateBookingHorizonAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const mode = String(formData.get("bookingHorizonMode") ?? "");
  const days = Number(formData.get("bookingHorizonDays"));

  if (mode !== "CURRENT_WEEK" && mode !== "FIXED_DAYS") {
    backToList("Wybierz tryb okna zapisów.");
  }
  if (
    mode === "FIXED_DAYS" &&
    !FIXED_HORIZON_OPTIONS.includes(days as (typeof FIXED_HORIZON_OPTIONS)[number])
  ) {
    backToList(`Liczba dni musi być jedną z: ${FIXED_HORIZON_OPTIONS.join(", ")}.`);
  }

  const horizonMode = mode as BookingHorizonMode;

  await prisma.$transaction(async (tx) => {
    await tx.clubSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        bookingHorizonMode: horizonMode,
        bookingHorizonDays: horizonMode === "FIXED_DAYS" ? days : 7,
      },
      update: {
        bookingHorizonMode: horizonMode,
        ...(horizonMode === "FIXED_DAYS" ? { bookingHorizonDays: days } : {}),
      },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SETTINGS_UPDATED",
      summary: `Zmieniono okno zapisów: ${describeHorizon(horizonMode, days)}`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

// Okno bezkosztowego odwołania. Zmiana działa od razu i tylko w przód: już
// odwołane rezerwacje mają wynik zapisany w bazie, więc skrócenie albo
// wydłużenie okna nie przelicza wstecz niczyjego przepadłego wejścia.
export async function updateCancellationWindowAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const hours = parseCancellationWindowHours(String(formData.get("freeCancellationHours") ?? ""));
  if (hours === null) {
    backToList(
      `Okno odwołania musi być pełną liczbą godzin od ${MIN_CANCELLATION_WINDOW_HOURS} do ${MAX_CANCELLATION_WINDOW_HOURS}.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.clubSettings.findUnique({ where: { id: "singleton" } });

    await tx.clubSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", freeCancellationHours: hours },
      update: { freeCancellationHours: hours },
    });

    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "SETTINGS_UPDATED",
      summary: `Zmieniono okno bezkosztowego odwołania: ${before?.freeCancellationHours ?? FREE_CANCELLATION_WINDOW_HOURS} → ${hours} godz.`,
    });
  });

  // Reguła jest widoczna dla klienta na grafiku i przy indywidualnych, więc
  // oba ekrany muszą pokazać nową wartość natychmiast.
  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  revalidatePath("/app/indywidualne");
  backToList();
}

export async function createCategoryAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder"));

  if (name.length < 3) backToList("Nazwa rodzaju musi mieć co najmniej 3 znaki.");
  if (!Number.isInteger(sortOrder)) backToList("Kolejność musi być liczbą.");

  const existing = await prisma.classCategory.findUnique({ where: { name } });
  if (existing) backToList("Rodzaj o tej nazwie już istnieje.");

  await prisma.$transaction(async (tx) => {
    await tx.classCategory.create({ data: { name, sortOrder } });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "CATEGORY_CHANGED",
      summary: `Dodano rodzaj zajęć "${name}"`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

export async function updateCategoryAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder"));

  if (!categoryId) backToList("Brak identyfikatora rodzaju.");
  if (name.length < 3) backToList("Nazwa rodzaju musi mieć co najmniej 3 znaki.");

  const duplicate = await prisma.classCategory.findFirst({
    where: { name, id: { not: categoryId } },
  });
  if (duplicate) backToList("Inny rodzaj ma już taką nazwę.");

  await prisma.$transaction(async (tx) => {
    await tx.classCategory.update({
      where: { id: categoryId },
      data: { name, sortOrder: Number.isInteger(sortOrder) ? sortOrder : undefined },
    });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "CATEGORY_CHANGED",
      summary: `Zmieniono rodzaj zajęć na "${name}"`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}

// Rodzaj chowamy zamiast kasować - zajęcia historyczne mają go przypisanego
// i po twardym usunięciu straciłyby kategorię w statystykach. Rodzaj
// automatyczny dla treningów indywidualnych musi zostać, bo bez niego zapisy
// indywidualne nie miałyby czego przypisać.
export async function toggleCategoryAction(formData: FormData) {
  const session = await requireRole("ADMIN");

  const categoryId = String(formData.get("categoryId") ?? "");
  const category = await prisma.classCategory.findUniqueOrThrow({ where: { id: categoryId } });

  if (category.isIndividual && category.active) {
    backToList(
      "Tego rodzaju nie można ukryć - to on jest automatycznie przypisywany treningom indywidualnym.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.classCategory.update({
      where: { id: categoryId },
      data: { active: !category.active },
    });
    await logActivity(tx, {
      actorUserId: session.user.id,
      action: "CATEGORY_CHANGED",
      summary: `${category.active ? "Ukryto" : "Przywrócono"} rodzaj zajęć "${category.name}"`,
    });
  });

  revalidatePath("/admin/zajecia");
  revalidatePath("/app");
  backToList();
}
