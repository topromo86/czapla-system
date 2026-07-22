import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";
import { PrintBar } from "./print-button";

export const metadata: Metadata = {
  title: "Zgody do podpisu - Czapla Boxing",
};

const ORDER = ["reg", "rodo", "health", "guardian", "image"];

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "long" }).format(
    date,
  );
}

// Wydruk zaakceptowanych zgód do podpisania. Osobna trasa POZA layoutem /app,
// żeby nagłówek, nawigacja i stopka nie trafiły na kartkę. Dostęp jak do
// kartoteki (klient, opiekun albo admin) - requireMemberAccess.
export default async function ConsentPrintPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  await requireMemberAccess(memberId);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { guardianUser: { select: { name: true } } },
  });
  if (!member) notFound();

  const consents = await prisma.consent.findMany({
    where: { memberId, revokedAt: null },
    include: { consentType: true },
  });
  const granted = consents.sort(
    (a, b) => ORDER.indexOf(a.consentType.key) - ORDER.indexOf(b.consentType.key),
  );

  const signatoryLabel = member.isMinor
    ? "Czytelny podpis opiekuna prawnego"
    : "Czytelny podpis";

  return (
    <main className="min-h-full bg-neutral-200 print:bg-white">
      <PrintBar backHref={`/app/zgody?member=${memberId}`} />

      <article className="mx-auto w-full max-w-[800px] bg-white p-8 text-black shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b border-black/20 pb-4">
          <p className="font-mono text-xs tracking-widest text-black/60 uppercase">Czapla Boxing</p>
          <h1 className="mt-1 text-2xl font-bold">Zgody i oświadczenia</h1>
          <p className="mt-1 text-sm text-black/60">
            Dokument wygenerowany {formatDate(new Date())}. Wydrukuj, podpisz i dostarcz do trenera
            lub recepcji.
          </p>
        </header>

        <section className="mt-5 grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-black/60">Imię i nazwisko: </span>
            <b>
              {member.firstName} {member.lastName}
            </b>
          </div>
          <div>
            <span className="text-black/60">Data urodzenia: </span>
            <b>{formatDate(member.birthDate)}</b>
          </div>
          {member.isMinor ? (
            <div className="sm:col-span-2">
              <span className="text-black/60">Opiekun prawny: </span>
              <b>{member.guardianUser?.name ?? "…………………………………………"}</b>
            </div>
          ) : null}
        </section>

        {granted.length === 0 ? (
          <p className="mt-6 rounded border border-black/20 p-4 text-sm">
            Brak zaakceptowanych zgód do wydruku. Zaakceptuj zgody w aplikacji (zakładka Zgody), a
            potem wróć tutaj po wydruk.
          </p>
        ) : (
          <ol className="mt-6 flex flex-col gap-5">
            {granted.map((c) => (
              <li key={c.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">
                    {c.consentType.label}
                    {c.consentType.required ? "" : " (opcjonalna)"}
                  </h2>
                  <span className="font-mono text-xs text-black/50 uppercase">
                    Zaakceptowano w aplikacji: {formatDate(c.grantedAt)}
                  </span>
                </div>
                <div
                  className="mt-1 text-sm leading-relaxed text-black/80"
                  dangerouslySetInnerHTML={{ __html: c.consentType.bodyHtml }}
                />
              </li>
            ))}
          </ol>
        )}

        <section className="mt-10 break-inside-avoid">
          <p className="text-sm">
            Potwierdzam, że zapoznałem/-am się z powyższymi zgodami i oświadczeniami oraz akceptuję
            ich treść.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div className="border-t border-black pt-1 text-xs text-black/60">
              Miejscowość i data
            </div>
            <div className="border-t border-black pt-1 text-xs text-black/60">{signatoryLabel}</div>
          </div>
        </section>
      </article>
    </main>
  );
}
