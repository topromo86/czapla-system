import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { todayInTimeZone } from "@/lib/domain/time";

const TASK_LABEL: Record<string, string> = {
  INACTIVE_7: "Brak treningu od 7 dni",
  INACTIVE_14: "Brak treningu od 14 dni",
  RENEWAL: "Kończy się karnet",
};

function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "percent", maximumFractionDigits: 0 }).format(
    ratio,
  );
}

function cohortKey(date: Date): string {
  const d = todayInTimeZone(date);
  return `${d.year}-${String(d.month).padStart(2, "0")}`;
}

export default async function RetencjaPage() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

  const [totalActive, maturedMembers, atRiskMemberIds, escalations, joinedMembers] =
    await Promise.all([
      prisma.member.count({ where: { status: "ACTIVE", joinedAt: { not: null } } }),
      prisma.member.findMany({
        where: { joinedAt: { lte: ninetyDaysAgo } },
        select: { status: true },
      }),
      prisma.retentionTask.findMany({
        where: { closedAt: null },
        select: { memberId: true },
        distinct: ["memberId"],
      }),
      prisma.retentionTask.findMany({
        where: { closedAt: null, escalatedAt: { not: null } },
        include: { member: true, trainer: { include: { user: true } } },
        orderBy: { escalatedAt: "asc" },
      }),
      prisma.member.findMany({
        where: { joinedAt: { not: null } },
        select: { joinedAt: true, status: true },
      }),
    ]);

  const ret90 =
    maturedMembers.length > 0
      ? maturedMembers.filter((m) => m.status !== "CHURNED").length / maturedMembers.length
      : null;

  const cohorts = new Map<string, { total: number; churned: number; matured: boolean }>();
  for (const m of joinedMembers) {
    const key = cohortKey(m.joinedAt!);
    const entry = cohorts.get(key) ?? {
      total: 0,
      churned: 0,
      matured: m.joinedAt! <= ninetyDaysAgo,
    };
    entry.total += 1;
    if (m.status === "CHURNED") entry.churned += 1;
    cohorts.set(key, entry);
  }
  const cohortRows = [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex gap-8">
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Aktywni</h2>
          <p className="font-display text-3xl">{totalActive}</p>
        </div>
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Retencja 90 dni (dojrzała kohorta, {maturedMembers.length})
          </h2>
          <p className="font-display text-3xl">
            {ret90 == null ? "za mało danych" : formatPercent(ret90)}
          </p>
        </div>
        <div>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Zagrożeni
          </h2>
          <p className="font-display text-red text-3xl">{atRiskMemberIds.length}</p>
        </div>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Eskalacje ({escalations.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {escalations.map((task) => (
            <li
              key={task.id}
              className="border-red/40 bg-red/5 flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="text-text font-medium">
                  {task.member.firstName} {task.member.lastName}
                </p>
                <p className="text-muted-brand font-mono text-xs">
                  {TASK_LABEL[task.type] ?? task.type} · opiekun: {task.trainer.user.name} ·
                  eskalowano {formatDate(task.escalatedAt!)}
                </p>
              </div>
            </li>
          ))}
          {escalations.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak eskalacji.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Tabela kohortowa (wg miesiąca dołączenia)
        </h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-muted-brand border-line border-b text-left font-mono text-xs uppercase">
                <th className="py-2">Miesiąc</th>
                <th className="py-2">Klientów</th>
                <th className="py-2">Odeszło</th>
                <th className="py-2">Retencja</th>
              </tr>
            </thead>
            <tbody>
              {cohortRows.map(([key, row]) => (
                <tr key={key} className="border-line-soft border-b">
                  <td className="py-2">{key}</td>
                  <td className="py-2">{row.total}</td>
                  <td className="py-2">{row.churned}</td>
                  <td className="py-2">
                    {formatPercent((row.total - row.churned) / row.total)}
                    {!row.matured ? (
                      <span className="text-muted-brand ml-1 text-xs">(świeża kohorta)</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-muted-brand text-xs">
        Pełny ranking trenerów z normalizacją retencji wg typu grupy - dopiero w Fazie 5, gdy
        zbierzemy min. 90 dni realnych danych (CLAUDE.md reguła 5).{" "}
        <Link href="/admin" className="text-brand-red underline">
          Wróć do Karnetów
        </Link>
      </p>
    </div>
  );
}
