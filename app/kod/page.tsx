import Link from "next/link";
import { requireSession } from "@/lib/auth/guard";
import { getOrCreateCheckInToken } from "@/lib/services/floor-checkin";
import { currentCodeFor } from "@/lib/services/rotating-code";
import { CODE_PERIOD_SECONDS, secondsLeftInPeriod } from "@/lib/domain/rotating-code";
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
  const now = new Date();

  // Kod rotacyjny: ważny 30 sekund, liczony z sekretu serwera. Kod stały dałoby
  // się wysłać koledze i odbić się z domu - ten trzeba pokazać kamerze na sali,
  // zanim wygaśnie.
  const code = currentCodeFor(session.user.id, now);
  const svg = await qrSvg(code);
  const home = ROLE_HOME[session.user.role] ?? "/app";

  // Token stały zostaje wyliczony, bo starsze stacje wejścia na obiekt nadal
  // go czytają - kod rotacyjny dotyczy odbić NA ZAJĘCIACH.
  await getOrCreateCheckInToken(session.user.id);

  // Strona odświeża się przed końcem okna, więc kod na ekranie jest zawsze
  // świeży, a odliczanie nie wymaga ani grama JS.
  const refreshIn = Math.max(5, secondsLeftInPeriod(now));

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
      <meta httpEquiv="refresh" content={String(refreshIn)} />
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
        Pokaż ten kod kamerze na sali, żeby odbić obecność. Kod jest ważny {CODE_PERIOD_SECONDS} s i
        odświeża się sam - zrzut ekranu nikomu nie zadziała.
      </p>

      <Link href={home} className="text-brand-red text-sm underline">
        ← Wróć do panelu
      </Link>
    </main>
  );
}
