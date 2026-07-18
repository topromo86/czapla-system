import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignPassAction } from "./actions";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
  }).format(date);
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const plans = await prisma.plan.findMany({ where: { active: true } });

  const members = await prisma.member.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: {
      passes: { where: { status: "ACTIVE" }, orderBy: { endsAt: "desc" }, take: 1 },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 50,
  });

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Szukaj klienta po imieniu, nazwisku lub e-mailu..."
          className="border-line bg-surface-2"
        />
        <Button type="submit" variant="outline">
          Szukaj
        </Button>
      </form>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const activePass = m.passes[0];
          const availablePlans = plans.filter((p) => p.forMinors === m.isMinor);

          return (
            <li
              key={m.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="text-text font-medium">
                  {m.firstName} {m.lastName}
                  {m.isMinor ? " (dziecko)" : ""}
                </p>
                <p className="text-muted-brand font-mono text-xs">
                  {activePass
                    ? `Aktywny karnet do ${formatDate(activePass.endsAt)}`
                    : "Brak aktywnego karnetu"}
                </p>
              </div>
              <form action={assignPassAction} className="flex items-center gap-2">
                <input type="hidden" name="memberId" value={m.id} />
                <select
                  name="planId"
                  required
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-1 text-sm"
                >
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm">
                  Załóż karnet
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
