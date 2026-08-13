import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/domain/registration";
import { sendEmail } from "@/lib/services/notify";

// Ile godzin żyje link resetu. Krótko, bo to poświadczenie w mailu; dłuższe
// okno tylko zwiększa okno na przejęcie, a klient i tak resetuje od razu.
const TOKEN_TTL_HOURS = 2;

// Token trzymamy jako hash SHA-256, nie surowy. Token ma 256 bitów losowości,
// więc SHA-256 wystarcza (nie potrzeba bcrypt jak przy hasłach, które bywają
// słabe) - wyciek bazy nie ujawnia użytecznego tokenu.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Prośba o reset. Zawsze kończy się cicho - NIE zdradzamy, czy adres istnieje
// w bazie (inaczej formularz stałby się wyszukiwarką kont klubu). E-mail idzie
// tylko wtedy, gdy konto naprawdę jest.
export async function requestPasswordReset(rawEmail: string, baseUrl: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) return;

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000);

  await prisma.$transaction(async (tx) => {
    // Unieważniamy wcześniejsze niewykorzystane tokeny tego konta - naraz ma
    // działać tylko jeden link, ten najświeższy.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
    });
  });

  const link = `${baseUrl}/reset-hasla/${rawToken}`;
  await sendEmail(
    email,
    "Czapla Boxing - reset hasła",
    `Cześć ${user.name},\n\n` +
      `Ktoś (miejmy nadzieję, że Ty) poprosił o reset hasła do konta Czapla Boxing.\n\n` +
      `Ustaw nowe hasło pod tym linkiem (ważny ${TOKEN_TTL_HOURS} godz.):\n${link}\n\n` +
      `Jeśli to nie Ty, zignoruj tę wiadomość - hasło zostanie bez zmian.`,
  );
}

export type ResetResult = "OK" | "INVALID_OR_EXPIRED";

// Ustawienie nowego hasła na podstawie tokenu z linku. Token jest jednorazowy
// i wygasa; walidację siły hasła robi warstwa wyżej (lib/domain/registration).
export async function resetPassword(
  rawToken: string,
  passwordHashInput: string,
): Promise<ResetResult> {
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!token || token.usedAt || token.expiresAt <= new Date()) {
    return "INVALID_OR_EXPIRED";
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash: passwordHashInput },
    });
    await tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  });

  return "OK";
}

// Sprawdzenie, czy link jest jeszcze do użycia - dla strony resetu, żeby od
// razu pokazać "link wygasł" zamiast formularza, który i tak odrzuci.
export async function isResetTokenValid(rawToken: string): Promise<boolean> {
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { expiresAt: true, usedAt: true },
  });
  return !!token && !token.usedAt && token.expiresAt > new Date();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
