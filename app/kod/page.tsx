import Link from "next/link";
import { requireSession } from "@/lib/auth/guard";
import { getOrCreateCheckInToken } from "@/lib/services/floor-checkin";
import { qrSvg } from "@/lib/qr";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Właściciel",
  TRAINER: "Trener",
  MEMBER: "Klubowicz",
  GUARDIAN: "Opiekun",
};

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  TRAINER: "/trainer",
  MEMBER: "/app",
  GUARDIAN: "/app",
};

export default async function CheckInCodePage() {
  const session = await requireSession();
  const token = await getOrCreateCheckInToken(session.user.id);
  const svg = await qrSvg(token);
  const home = ROLE_HOME[session.user.role] ?? "/app";

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Mój kod wejścia</h1>
        <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
          {ROLE_LABEL[session.user.role] ?? "Konto"} · {session.user.name}
        </p>
      </div>

      {/* Biała ramka niezależnie od motywu - czytnik potrzebuje kontrastu. */}
      <div
        className="w-full max-w-[16rem] rounded-lg bg-white p-4 shadow-sm"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <p className="text-muted-brand text-sm">
        Pokaż ten kod na stacji przy wejściu na salę, żeby odbić obecność. Kod jest Twój i stały -
        nie musisz go odświeżać.
      </p>

      <Link href={home} className="text-brand-red text-sm underline">
        ← Wróć do panelu
      </Link>
    </main>
  );
}
