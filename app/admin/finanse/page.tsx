import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";
import { todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export default async function FinansePage() {
  const now = new Date();
  const today = todayInTimeZone(now);
  const monthStart = zonedTimeToUtc(today.year, today.month, 1, 0, 0);
  const nextMonth =
    today.month === 12
      ? { year: today.year + 1, month: 1 }
      : { year: today.year, month: today.month + 1 };
  const monthEnd = zonedTimeToUtc(nextMonth.year, nextMonth.month, 1, 0, 0);

  const [locations, monthPayments, allPaymentsByMember, activeMembers] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.payment.findMany({
      where: { recordedAt: { gte: monthStart, lt: monthEnd } },
      include: { pass: { include: { plan: true } } },
    }),
    prisma.payment.groupBy({ by: ["memberId"], _sum: { amountGross: true } }),
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      include: { passes: { orderBy: { endsAt: "desc" }, take: 1 } },
    }),
  ]);

  const totalRevenue = monthPayments.reduce((sum, p) => sum + p.amountGross, 0);

  const revenueByLocation = new Map<string, number>();
  for (const p of monthPayments) {
    revenueByLocation.set(p.locationId, (revenueByLocation.get(p.locationId) ?? 0) + p.amountGross);
  }

  const revenueByPlan = new Map<string, { name: string; count: number; total: number }>();
  for (const p of monthPayments) {
    const key = p.pass?.planId ?? "none";
    const name = p.pass?.plan.name ?? "Bez planu (korekta/inne)";
    const entry = revenueByPlan.get(key) ?? { name, count: 0, total: 0 };
    entry.count += 1;
    entry.total += p.amountGross;
    revenueByPlan.set(key, entry);
  }

  const totalAllTime = allPaymentsByMember.reduce((s, p) => s + (p._sum.amountGross ?? 0), 0);
  const payingMembersCount = allPaymentsByMember.length;
  const ltv = payingMembersCount > 0 ? totalAllTime / payingMembersCount : 0;

  const expiredToRecover = activeMembers
    .filter((m) => m.passes[0] && m.passes[0].endsAt < now)
    .sort((a, b) => a.passes[0]!.endsAt.getTime() - b.passes[0]!.endsAt.getTime());

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Przychód - {monthLabel(today.year, today.month)}
        </h2>
        <p className="font-display text-brand-red mt-1 text-3xl">{formatMoney(totalRevenue)}</p>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Podział na lokalizacje
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-text font-medium">{loc.name}</span>
              <span className="font-mono text-sm">
                {formatMoney(revenueByLocation.get(loc.id) ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Struktura karnetów (ten miesiąc)
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {[...revenueByPlan.values()].map((entry) => (
            <li
              key={entry.name}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-text font-medium">
                {entry.name}{" "}
                <span className="text-muted-brand font-mono text-xs">× {entry.count}</span>
              </span>
              <span className="font-mono text-sm">{formatMoney(entry.total)}</span>
            </li>
          ))}
          {revenueByPlan.size === 0 ? (
            <li className="text-muted-brand text-sm">Brak sprzedaży w tym miesiącu.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          LTV (średni przychód na płacącego klienta, całościowo)
        </h2>
        <p className="font-display mt-1 text-2xl">{formatMoney(ltv)}</p>
        <p className="text-muted-brand mt-1 text-xs">
          Liczone jako suma wszystkich wpłat / liczba klientów, którzy kiedykolwiek zapłacili (
          {payingMembersCount}). Uproszczony wskaźnik - nie uwzględnia czasu trwania relacji.
        </p>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Wygasłe karnety do odzyskania ({expiredToRecover.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {expiredToRecover.map((m) => {
            const pass = m.passes[0]!;
            const daysAgo = Math.floor((now.getTime() - pass.endsAt.getTime()) / 86_400_000);
            return (
              <li
                key={m.id}
                className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
              >
                <span className="text-text font-medium">
                  {m.firstName} {m.lastName}
                </span>
                <span className="text-red font-mono text-xs">
                  Wygasł {formatDate(pass.endsAt)} ({daysAgo} dni temu)
                </span>
              </li>
            );
          })}
          {expiredToRecover.length === 0 ? (
            <li className="text-muted-brand text-sm">
              Brak - wszyscy aktywni klienci mają ważny karnet.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
