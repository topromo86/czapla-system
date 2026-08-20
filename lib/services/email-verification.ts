import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/services/notify";

// Link ważny dobę - potwierdzenie e-maila nie jest pilne jak reset hasła.
const TOKEN_TTL_HOURS = 24;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Wysyła link potwierdzający na adres konta. Zwraca, czy mail faktycznie
// poszedł - wywołujący decyduje, co zrobić, gdy poczta nie jest jeszcze
// skonfigurowana.
export async function sendVerificationEmail(input: {
  userId: string;
  email: string;
  name: string;
  baseUrl: string;
}): Promise<boolean> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000);

  await prisma.$transaction(async (tx) => {
    // Naraz ważny tylko najświeższy link.
    await tx.emailVerificationToken.updateMany({
      where: { userId: input.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.emailVerificationToken.create({
      data: { userId: input.userId, tokenHash: hashToken(rawToken), expiresAt },
    });
  });

  const link = `${input.baseUrl}/potwierdz-email/${rawToken}`;
  return sendEmail(
    input.email,
    "Czapla Boxing - potwierdź adres e-mail",
    `Cześć ${input.name},\n\n` +
      `Potwierdź swój adres e-mail, klikając w link (ważny ${TOKEN_TTL_HOURS} godz.):\n${link}\n\n` +
      `Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`,
    { buttonLabel: "Potwierdź adres" },
  );
}

// Na rejestracji: gdy poczta działa, wysyłamy potwierdzenie i zostawiamy konto
// niezweryfikowane. Gdy poczty jeszcze nie ma (SMTP nieskonfigurowany), nie da
// się wysłać linku - wtedy oznaczamy adres jako zweryfikowany od razu, żeby
// brak SMTP nie blokował rejestracji. Po podpięciu SMTP nowe konta przejdą
// pełną weryfikację.
export async function startEmailVerification(input: {
  userId: string;
  email: string;
  name: string;
  baseUrl: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return;
  }
  await sendVerificationEmail(input);
}

export type VerifyResult = "OK" | "INVALID_OR_EXPIRED";

export async function verifyEmailToken(rawToken: string): Promise<VerifyResult> {
  const token = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { emailVerifiedAt: true } },
    },
  });
  if (!token) return "INVALID_OR_EXPIRED";

  // Idempotencja: token bywa zużyty, zanim klient kliknie - skanery linków w
  // poczcie firmowej i antywirusy pre-fetchują adresy z maili. Jeśli konto
  // jest już potwierdzone, pokazujemy sukces (to prawda), zamiast straszyć
  // "link wygasł" osobę, której e-mail właśnie został zweryfikowany.
  if (token.usedAt || token.expiresAt <= new Date()) {
    return token.user.emailVerifiedAt ? "OK" : "INVALID_OR_EXPIRED";
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.emailVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  });
  return "OK";
}
