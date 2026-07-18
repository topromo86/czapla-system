import "server-only";
import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

// Zdejmuje jedno wejście z aktywnego karnetu limitowanego klienta. Wywoływane
// dopiero przy realnej obecności (Attendance) albo spóźnionym odwołaniu
// (NO_SHOW) - nigdy przy samej rezerwacji (SPEC.md sekcja 2: "rezerwacja NIE
// zdejmuje wejścia"). Karnety OPEN (entriesLeft null) są pomijane.
export async function decrementPassEntryIfLimited(tx: Tx, memberId: string) {
  const pass = await tx.pass.findFirst({
    where: { memberId, status: "ACTIVE" },
    orderBy: { endsAt: "desc" },
  });
  if (pass && pass.entriesLeft != null) {
    await tx.pass.update({ where: { id: pass.id }, data: { entriesLeft: { decrement: 1 } } });
  }
}
