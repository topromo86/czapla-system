import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/domain/registration";

// Logowanie przez Google jest opcjonalne: włącza się dopiero, gdy w środowisku
// są klucze OAuth. Bez nich aplikacja działa jak dotąd (login e-mail + hasło),
// a przycisk Google się nie pokazuje - ta sama zasada co przy poczcie i SMS.
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email" },
      password: { label: "Hasło", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email : null;
      const password = typeof credentials?.password === "string" ? credentials.password : null;
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  }),
];

if (isGoogleConfigured()) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    // Bramka wejścia. Dla Google zakładamy konto przy pierwszym logowaniu, ale
    // BEZ kartoteki - tę klient uzupełnia w kroku /dokoncz-profil (Google nie
    // zna trenera, lokalizacji ani daty urodzenia, których wymaga model).
    //
    // Dopasowanie po e-mailu jest bezpieczne: Google potwierdza adres, więc
    // logowanie Google e-mailem X = ta sama osoba, co konto hasłowe z X.
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const email = typeof profile?.email === "string" ? normalizeEmail(profile.email) : null;
      if (!email || profile?.email_verified === false) return false;

      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      } else {
        await prisma.user.create({
          data: {
            email,
            name: typeof profile?.name === "string" ? profile.name : email,
            role: "MEMBER",
            emailVerifiedAt: new Date(),
            lastLoginAt: new Date(),
          },
        });
      }
      return true;
    },

    async jwt({ token, user, account, profile }) {
      // Google: id i rolę bierzemy z NASZEGO usera (signIn już go założył),
      // nie z profilu Google - profil.sub to nie nasze id.
      if (account?.provider === "google" && typeof profile?.email === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { email: normalizeEmail(profile.email) },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      } else if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
