import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { classifyPassStatus } from "@/lib/domain/pass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignPassAction } from "./actions";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
  }).format(date);
}

type AdminSearchParams = { q?: string; sex?: string; minors?: string };

function buildHref(current: AdminSearchParams, overrides: Partial<AdminSearchParams>): string {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.sex) params.set("sex", merged.sex);
  if (merged.minors) params.set("minors", merged.minors);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const { q, sex, minors } = params;
  const plans = await prisma.plan.findMany({ where: { active: true } });

  const members = await prisma.member.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
        sex === "MALE" || sex === "FEMALE" ? { sex } : {},
        minors === "1" ? { isMinor: true } : {},
      ],
    },
    include: {
      passes: { where: { status: "ACTIVE" }, orderBy: { endsAt: "desc" }, take: 1 },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 50,
  });

  const now = new Date();
  const STATUS_STYLE: Record<string, string> = {
    NONE: "text-red",
    EXPIRING_SOON: "text-amber",
    ACTIVE: "text-jade",
  };

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        {sex ? <input type="hidden" name="sex" value={sex} /> : null}
        {minors ? <input type="hidden" name="minors" value={minors} /> : null}
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

      <div className="flex gap-2">
        <Link href={buildHref(params, { sex: sex === "FEMALE" ? undefined : "FEMALE" })}>
          <Button type="button" variant={sex === "FEMALE" ? "default" : "outline"} size="sm">
            Kobieta
          </Button>
        </Link>
        <Link href={buildHref(params, { sex: sex === "MALE" ? undefined : "MALE" })}>
          <Button type="button" variant={sex === "MALE" ? "default" : "outline"} size="sm">
            Mężczyzna
          </Button>
        </Link>
        <Link href={buildHref(params, { minors: minors === "1" ? undefined : "1" })}>
          <Button type="button" variant={minors === "1" ? "default" : "outline"} size="sm">
            Nieletni
          </Button>
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const activePass = m.passes[0];
          const availablePlans = plans.filter((p) => p.forMinors === m.isMinor);
          const badge = classifyPassStatus(activePass ?? null, now);

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
                <p className={`font-mono text-xs ${STATUS_STYLE[badge]}`}>
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
        {members.length === 0 ? <li className="text-muted-brand text-sm">Brak wyników.</li> : null}
      </ul>
    </div>
  );
}
