import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/app/generated/prisma/client";

// Jedyne miejsce autoryzacji w aplikacji (CLAUDE.md, sekcja "Konwencje kodu").
// Trener widzi wyłącznie swoich podopiecznych, rodzic wyłącznie swoje dziecko -
// te reguły są egzekwowane tutaj, nigdy tylko w UI.

export class ForbiddenError extends Error {}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    throw new ForbiddenError(`Wymagana rola: ${roles.join(" lub ")}`);
  }
  return session;
}

async function requireTrainerRecord() {
  const session = await requireSession();
  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } });
  if (!trainer) throw new ForbiddenError("Brak rekordu trenera dla tego konta.");
  return { session, trainer };
}

// ADMIN pomija ograniczenia właścicielskie - ekrany /admin wymagają wglądu
// we wszystkich trenerów i podopiecznych (SPEC.md sekcja 3).
export async function requireOwnsMember(memberId: string) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;

  if (session.user.role === "TRAINER") {
    const { trainer } = await requireTrainerRecord();
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { ownerTrainerId: true },
    });
    if (member?.ownerTrainerId === trainer.id) return session;
  }
  throw new ForbiddenError("Brak dostępu do tego podopiecznego.");
}

export async function requireGuardianOfMember(memberId: string) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;

  if (session.user.role === "GUARDIAN") {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { guardianUserId: true },
    });
    if (member?.guardianUserId === session.user.id) return session;
  }
  throw new ForbiddenError("Brak dostępu do tego dziecka.");
}
