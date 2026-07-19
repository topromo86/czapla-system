import Link from "next/link";
import { Eye } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { classifyPassStatus, MAX_FROZEN_DAYS } from "@/lib/domain/pass";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { freezePassAction, unfreezePassAction } from "./actions";

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
      passes: {
        where: { status: { in: ["ACTIVE", "FROZEN"] } },
        orderBy: { endsAt: "desc" },
        take: 1,
      },
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

      <p className="text-muted-brand text-xs">
        Sprzedaż karnetu wykonuje trener na ekranie Kasa - tutaj tylko podgląd, edycja i
        zamrożenie.
      </p>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const activePass = m.passes[0];
          const isFrozen = activePass?.status === "FROZEN";
          const badge = classifyPassStatus(!isFrozen ? (activePass ?? null) : null, now);

          return (
            <li
              key={m.id}
              className="border-line bg-surface flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/klienci/${m.id}`}
                  aria-label={`Podgląd karty klienta ${m.firstName} ${m.lastName}`}
                >
                  <Button type="button" variant="outline" size="icon-lg" className="size-11 shrink-0">
                    <Eye className="size-5" />
                  </Button>
                </Link>
                <div>
                  <p className="text-text font-medium">
                    {m.firstName} {m.lastName}
                    {m.isMinor ? " (dziecko)" : ""}
                  </p>
                  {isFrozen ? (
                    <p className="text-muted-brand font-mono text-xs">
                      Zamrożony (do {formatDate(activePass!.endsAt)}, wykorzystano{" "}
                      {activePass!.frozenDaysUsed}/{MAX_FROZEN_DAYS} dni)
                    </p>
                  ) : (
                    <p className={`font-mono text-xs ${STATUS_STYLE[badge]}`}>
                      {activePass
                        ? `Aktywny karnet do ${formatDate(activePass.endsAt)}`
                        : "Brak aktywnego karnetu"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isFrozen ? (
                  <form action={unfreezePassAction}>
                    <input type="hidden" name="passId" value={activePass!.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Odmroź
                    </Button>
                  </form>
                ) : activePass && activePass.frozenDaysUsed < MAX_FROZEN_DAYS ? (
                  <form action={freezePassAction}>
                    <input type="hidden" name="passId" value={activePass.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Zamroź
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
        {members.length === 0 ? <li className="text-muted-brand text-sm">Brak wyników.</li> : null}
      </ul>
    </div>
  );
}
