import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/domain/registration";
import { sendEmail } from "@/lib/services/notify";

// Alfabet bez znaków mylących w druku i przy przepisywaniu (0/O, 1/l/I).
// Hasło tymczasowe czyta się z ekranu albo z maila, więc czytelność ważniejsza
// niż maksymalna entropia - i tak jest losowe i długie.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// Losowe hasło tymczasowe. randomInt z node:crypto, nie Math.random - to
// poświadczenie, więc źródło losowości musi być kryptograficzne.
export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  }
  return out;
}

export type ProvisionResult =
  | { ok: true; password: string; emailed: boolean }
  | { ok: false; error: "MEMBER_NOT_FOUND" | "ALREADY_HAS_ACCOUNT" | "EMAIL_TAKEN" };

// Zakłada konto logowania dla istniejącej kartoteki (ścieżka admina). Generuje
// hasło tymczasowe, wysyła je mailem i - niezależnie - zwraca do pokazania na
// ekranie. Zwracamy zawsze, bo poczta może nie być skonfigurowana albo nie
// dojść; wtedy admin przepisze hasło ręcznie zamiast utknąć.
export async function provisionLoginAccount(input: {
  memberId: string;
  email: string;
}): Promise<ProvisionResult> {
  const email = normalizeEmail(input.email);

  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });
  if (!member) return { ok: false, error: "MEMBER_NOT_FOUND" };
  if (member.userId) return { ok: false, error: "ALREADY_HAS_ACCOUNT" };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "EMAIL_TAKEN" };

  const password = generateTempPassword();
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: `${member.firstName} ${member.lastName}`,
        role: "MEMBER",
        passwordHash,
      },
    });
    await tx.member.update({ where: { id: member.id }, data: { userId: user.id } });
  });

  const emailed = await sendEmail(
    email,
    "Czapla Boxing - dane do logowania",
    `Cześć ${member.firstName},\n\n` +
      `Klub założył Ci konto w aplikacji Czapla Boxing.\n\n` +
      `Login (e-mail): ${email}\n` +
      `Hasło tymczasowe: ${password}\n\n` +
      `Zaloguj się i zmień hasło przez "Nie pamiętasz hasła?" na ekranie logowania.`,
  );

  return { ok: true, password, emailed };
}
