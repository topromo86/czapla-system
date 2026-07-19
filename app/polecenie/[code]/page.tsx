import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BrandHeaderLogo } from "../../brand-header-logo";

// Publiczna, niewymagająca logowania strona pod linkiem z ekranu "Polecenia"
// (SPEC.md sekcja 3). Klub nie ma samoobsługowej rejestracji - to wyłącznie
// strona informacyjna, kod trzeba podać na miejscu/telefonicznie, admin
// wpisuje go przy zakładaniu klienta (app/admin/klienci/nowy).
export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referral = await prisma.referral.findUnique({
    where: { code: code.toUpperCase() },
    include: { referrerMember: true },
  });

  if (!referral) notFound();

  const isActive = referral.status === "SENT";

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <div className="border-line bg-surface flex w-full max-w-sm flex-col items-center gap-4 rounded-md border p-6 text-center">
        <BrandHeaderLogo />
        {isActive ? (
          <>
            <p className="text-text">
              {referral.referrerMember.firstName} poleca Ci Czapla Boxing!
            </p>
            <p className="text-muted-brand text-sm">
              Przyjdź na salę w Mikołowie lub Tychach i podaj kod przy zapisie:
            </p>
            <p className="text-brand-red font-mono text-2xl font-bold tracking-widest">
              {referral.code}
            </p>
          </>
        ) : (
          <p className="text-muted-brand text-sm">Ten kod polecenia został już wykorzystany.</p>
        )}
      </div>
    </main>
  );
}
