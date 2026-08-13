import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

const PASS_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktywny",
  FROZEN: "Zamrożony",
  EXPIRED: "Wygasły",
  CANCELLED: "Anulowany",
};

const PASS_STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-jade",
  FROZEN: "text-amber",
  EXPIRED: "text-red",
  CANCELLED: "text-red",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Gotówka",
  BLIK: "BLIK",
  TRANSFER: "Przelew",
};

// Podgląd karnetu i historii płatności klienta (SPEC.md sekcja 2: "klient
// nic nie opłaca w apce", ten ekran jest wyłącznie do odczytu).
export default async function MyPassPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const params = await searchParams;
  const members = await getAccessibleMembers();
  if (members.length === 0) return null; // layout już pokazał komunikat

  const activeMember = members.find((m) => m.id === params.member) ?? members[0];

  const [passes, payments] = await Promise.all([
    prisma.pass.findMany({
      where: { memberId: activeMember.id },
      orderBy: { endsAt: "desc" },
      include: { plan: true },
    }),
    prisma.payment.findMany({
      where: { memberId: activeMember.id },
      orderBy: { recordedAt: "desc" },
      take: 20,
    }),
  ]);

  const currentPass = passes.find((p) => p.status === "ACTIVE" || p.status === "FROZEN");

  return (
    <div className="flex flex-col gap-6">
      {members.length > 1 ? (
        <div className="flex gap-2">
          {members.map((m) => (
            <Link key={m.id} href={`/app/karnet?member=${m.id}`}>
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
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Aktualny karnet
        </h2>
        {currentPass ? (
          <div className="border-line bg-surface mt-2 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="text-text font-medium">{currentPass.plan.name}</p>
              <span
                className={`font-mono text-xs tracking-widest uppercase ${PASS_STATUS_STYLE[currentPass.status]}`}
              >
                {PASS_STATUS_LABEL[currentPass.status]}
              </span>
            </div>
            <p className="text-muted-brand mt-1 text-sm">
              {formatDate(currentPass.startsAt)} - {formatDate(currentPass.endsAt)}
            </p>
            {currentPass.entriesLeft != null ? (
              <p className="text-muted-brand mt-1 text-sm">
                Pozostało wejść: {currentPass.entriesLeft}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-red mt-2 text-sm">Brak aktywnego karnetu - skontaktuj się z klubem.</p>
        )}
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Historia karnetów
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {passes.map((p) => (
            <li
              key={p.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-text font-medium">{p.plan.name}</span>
              <span className="text-muted-brand font-mono text-xs">
                {formatDate(p.startsAt)} - {formatDate(p.endsAt)} · {PASS_STATUS_LABEL[p.status]}
              </span>
            </li>
          ))}
          {passes.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak karnetów.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Historia płatności
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {payments.map((p) => (
            <li
              key={p.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-text font-medium">{formatMoney(p.amountGross)}</span>
              <span className="text-muted-brand font-mono text-xs">
                {formatDate(p.recordedAt)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
              </span>
            </li>
          ))}
          {payments.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak płatności.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
