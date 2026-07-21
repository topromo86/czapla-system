import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Member, Role } from "@/app/generated/prisma/client";

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

// Dostęp opiekuna do dziecka. Kluczem jest dopasowanie guardianUserId, a NIE
// rola: rodzic, który sam trenuje, ma rolę MEMBER, ale nadal jest opiekunem
// swojego dziecka. Wcześniej wymagaliśmy roli GUARDIAN i taki rodzic tracił
// dostęp - dlatego patrzymy tylko na powiązanie.
export async function requireGuardianOfMember(memberId: string) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { guardianUserId: true },
  });
  if (member?.guardianUserId === session.user.id) return session;
  throw new ForbiddenError("Brak dostępu do tego dziecka.");
}

// Dostęp klienta (do samego siebie) albo jego opiekuna - ekrany i akcje /app
// (grafik, zapisy, zgody). ADMIN pomija ograniczenie (wsparcie/diagnostyka).
// Znów: liczy się powiązanie (userId albo guardianUserId), nie rola - żeby
// rodzic-klubowicz działał w imieniu dziecka tak samo jak czysty GUARDIAN.
export async function requireMemberAccess(memberId: string) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { userId: true, guardianUserId: true },
  });
  const isSelf = member?.userId === session.user.id;
  const isGuardian = member?.guardianUserId === session.user.id;
  if (isSelf || isGuardian) return session;

  throw new ForbiddenError("Brak dostępu do tego konta.");
}

// Rekord trenera dla ekranów /trainer - ściśle rola TRAINER (bez wyjątku dla
// ADMIN, w odróżnieniu od requireOwnsMember - /admin ma własne ekrany).
export async function requireTrainerSelf() {
  const session = await requireRole("TRAINER");
  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } });
  if (!trainer) throw new ForbiddenError("Brak rekordu trenera dla tego konta.");
  return { session, trainer };
}

// Trener może działać tylko na sesjach, które prowadzi - ekran "Dziś" (lista
// obecności, ręczne uzupełnianie).
//
// Zastępca dostaje dostęp dopiero po potwierdzeniu. Wcześniej widzi zajęcia
// na swoim ekranie (żeby móc kliknąć "potwierdzam"), ale nie odhacza jeszcze
// cudzej listy obecności - do tego czasu odpowiada za nie trener pierwotny.
export async function requireOwnsSession(sessionId: string) {
  const { session, trainer } = await requireTrainerSelf();
  const target = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, substituteTrainerId: true, substituteStatus: true },
  });
  if (!target) throw new ForbiddenError("Brak dostępu do tych zajęć.");

  const isOwner = target.trainerId === trainer.id;
  const isConfirmedSubstitute =
    target.substituteTrainerId === trainer.id && target.substituteStatus === "ACCEPTED";

  if (isOwner || isConfirmedSubstitute) return session;
  throw new ForbiddenError("Brak dostępu do tych zajęć.");
}

export type MemberRelation = "self" | "child";
export type AccessibleMember = Member & { relation: MemberRelation };

// Lista Member, w imieniu których zalogowany użytkownik może działać w /app.
// Zwraca WŁASNĄ kartotekę (jeśli sam trenuje) ORAZ wszystkie dzieci, których
// jest opiekunem - dlatego rodzic-klubowicz widzi w jednym miejscu siebie i
// dziecko. Każdy wpis niesie relację ("self"/"child"), żeby grafik mógł
// oznaczyć zajęcia dziecka jako dziecka. Własna kartoteka zawsze pierwsza.
export async function getAccessibleMembers(): Promise<AccessibleMember[]> {
  const session = await requireRole("MEMBER", "GUARDIAN");

  const [own, children] = await Promise.all([
    prisma.member.findUnique({ where: { userId: session.user.id } }),
    prisma.member.findMany({
      where: { guardianUserId: session.user.id },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const result: AccessibleMember[] = [];
  if (own) result.push({ ...own, relation: "self" });
  for (const child of children) {
    // Teoretyczny brzeg: gdyby ktoś był opiekunem samego siebie, nie dublujemy.
    if (child.id === own?.id) continue;
    result.push({ ...child, relation: "child" });
  }
  return result;
}
