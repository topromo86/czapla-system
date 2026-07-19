import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { generateReferralCodeAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  SENT: "Wysłany, jeszcze nieużyty",
  REGISTERED: "Osoba dołączyła, czeka na pierwszą płatność",
  CONVERTED: "Zrealizowane - osoba zapłaciła",
  REWARDED: "Nagroda przyznana",
};

// "Polecenia" (SPEC.md sekcja 3): kod, link, śledzenie konwersji. Kod jest
// jednorazowy - każde nowe polecenie to nowy wygenerowany kod (patrz
// lib/services/referral.ts). Link prowadzi na publiczną stronę informacyjną,
// nie na formularz samodzielnej rejestracji - klub nie ma samoobsługowego
// zapisu, każdego klienta zakłada trener/właściciel.
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const params = await searchParams;
  const members = await getAccessibleMembers();
  if (members.length === 0) return null;

  const activeMember = members.find((m) => m.id === params.member) ?? members[0];
  const host = (await headers()).get("host");
  const origin = host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "";

  const referrals = await prisma.referral.findMany({
    where: { referrerMemberId: activeMember.id },
    include: { refereeMember: true },
    orderBy: { createdAt: "desc" },
  });

  const convertedCount = referrals.filter(
    (r) => r.status === "CONVERTED" || r.status === "REWARDED",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {members.length > 1 ? (
        <div className="flex gap-2">
          {members.map((m) => (
            <Link key={m.id} href={`/app/polecenia?member=${m.id}`}>
              <Button
                type="button"
                variant={m.id === activeMember.id ? "default" : "outline"}
                size="sm"
              >
                {m.firstName}
              </Button>
            </Link>
          ))}
        </div>
      ) : null}

      <section>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Polecenia</h1>
        <p className="text-muted-brand mt-1 text-sm">
          {convertedCount > 0
            ? `${convertedCount} poleconych osób dołączyło do klubu. Zapytaj trenera o aktualne zasady nagród.`
            : "Poleć klub znajomym - zapytaj trenera o aktualne zasady nagród za polecenia."}
        </p>
      </section>

      <form action={generateReferralCodeAction}>
        <input type="hidden" name="memberId" value={activeMember.id} />
        <Button type="submit" size="sm">
          Wygeneruj nowy kod polecenia
        </Button>
      </form>

      <ul className="flex flex-col gap-2">
        {referrals.map((r) => (
          <li key={r.id} className="border-line bg-surface rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-text font-mono text-lg font-medium">{r.code}</span>
              <span className="text-muted-brand font-mono text-xs">{formatDate(r.createdAt)}</span>
            </div>
            {r.status === "SENT" && origin ? (
              <p className="text-muted-brand mt-1 text-xs break-all">
                {origin}/polecenie/{r.code}
              </p>
            ) : null}
            <p className="text-jade mt-1 text-sm">
              {STATUS_LABEL[r.status] ?? r.status}
              {r.refereeMember ? ` - ${r.refereeMember.firstName} ${r.refereeMember.lastName}` : ""}
            </p>
          </li>
        ))}
        {referrals.length === 0 ? (
          <li className="text-muted-brand text-sm">Nie masz jeszcze żadnych poleceń.</li>
        ) : null}
      </ul>
    </div>
  );
}
