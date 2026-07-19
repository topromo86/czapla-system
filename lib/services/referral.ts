import "server-only";
import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

// Bez znaków mylących się wizualnie (0/O, 1/I) - kod bywa dyktowany przez telefon.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Kod jest jednorazowy (Referral.code jest unique) - żeby polecić kolejną
// osobę, klient generuje nowy kod. Kilka prób w razie kolizji losowania.
export async function createReferralCode(tx: Tx, referrerMemberId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.referral.create({ data: { code: generateCode(), referrerMemberId } });
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Nie udało się wygenerować unikalnego kodu.");
}

// Przy tworzeniu nowego klienta z podanym kodem: SENT -> REGISTERED, kod
// przestaje być aktywny do ponownego użycia. Zwraca trenera-opiekuna
// polecającego, żeby nowy klient trafił do tej samej relacji zaufania
// ("przypisanie do opiekuna" z checklisty Fazy 6).
export async function registerReferralIfCodeProvided(
  tx: Tx,
  code: string,
  refereeMemberId: string,
): Promise<{ referrerOwnerTrainerId: string } | null> {
  const referral = await tx.referral.findUnique({
    where: { code },
    include: { referrerMember: true },
  });
  if (!referral || referral.status !== "SENT" || referral.refereeMemberId) return null;

  await tx.referral.update({
    where: { id: referral.id },
    data: { refereeMemberId, status: "REGISTERED" },
  });

  return { referrerOwnerTrainerId: referral.referrerMember.ownerTrainerId };
}

// "Śledzenie konwersji" (checklisty Fazy 6) - pierwsza opłacona transakcja
// referee = konwersja polecenia. Wywoływane z markJoinedIfNeeded.
export async function convertReferralIfPending(tx: Tx, refereeMemberId: string, when: Date) {
  const referral = await tx.referral.findFirst({
    where: { refereeMemberId, status: "REGISTERED" },
  });
  if (!referral) return;

  await tx.referral.update({
    where: { id: referral.id },
    data: { status: "CONVERTED", convertedAt: when },
  });
}
