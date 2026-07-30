import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, Role } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveScanOutcome, type ScanOutcome } from "@/lib/domain/floor-checkin";
import { getClubSettings } from "@/lib/services/settings";

type Db = PrismaClient | Prisma.TransactionClient;

// Osobisty token wejścia. Generowany leniwie przy pierwszym wyświetleniu kodu,
// potem stały - ten sam QR działa co trening. Wspólny dla klienta i trenera.
export async function getOrCreateCheckInToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { checkInToken: true },
  });
  if (user.checkInToken) return user.checkInToken;

  const token = randomUUID();
  await prisma.user.update({ where: { id: userId }, data: { checkInToken: token } });
  return token;
}

export type RecordCheckInResult =
  | { ok: false; reason: "UNKNOWN_TOKEN" }
  | {
      ok: true;
      outcome: ScanOutcome;
      user: { id: string; name: string; role: Role };
      enteredAt: Date;
    };

// Odbicie wejścia z zeskanowanego tokenu. Anti-"nabijanie": powtórne odbicie w
// oknie floorMinMinutes nie tworzy drugiego wejścia, tylko zwraca to pierwsze
// (obsługa widzi "już na sali od HH:MM"). Działa dla klienta i trenera - to
// samo konto, ten sam mechanizm.
export async function recordFloorCheckInByToken(input: {
  token: string;
  locationId: string;
  recordedByUserId: string | null;
  now?: Date;
  db?: Db;
}): Promise<RecordCheckInResult> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();

  const user = await db.user.findUnique({
    where: { checkInToken: input.token.trim() },
    select: { id: true, name: true, role: true },
  });
  if (!user) return { ok: false, reason: "UNKNOWN_TOKEN" };

  const { floorMinMinutes } = await getClubSettings();

  const last = await db.floorCheckIn.findFirst({
    where: { userId: user.id, locationId: input.locationId },
    orderBy: { enteredAt: "desc" },
    select: { enteredAt: true },
  });

  const outcome = resolveScanOutcome({
    lastEnteredAt: last?.enteredAt ?? null,
    now,
    minMinutes: floorMinMinutes,
  });

  if (outcome === "ALREADY_ON_FLOOR" && last) {
    return { ok: true, outcome, user, enteredAt: last.enteredAt };
  }

  const created = await db.floorCheckIn.create({
    data: {
      userId: user.id,
      locationId: input.locationId,
      recordedByUserId: input.recordedByUserId,
      enteredAt: now,
    },
    select: { enteredAt: true },
  });

  return { ok: true, outcome, user, enteredAt: created.enteredAt };
}
