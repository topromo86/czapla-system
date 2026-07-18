import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { grantConsentAction, revokeConsentAction } from "./actions";

const ORDER = ["reg", "rodo", "health", "guardian", "image"];

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
  }).format(date);
}

export default async function ConsentsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const params = await searchParams;
  const members = await getAccessibleMembers();
  if (members.length === 0) return null;

  const activeMember = members.find((m) => m.id === params.member) ?? members[0];

  const [consentTypes, consents] = await Promise.all([
    prisma.consentType.findMany(),
    prisma.consent.findMany({
      where: { memberId: activeMember.id, revokedAt: null },
      orderBy: { grantedAt: "desc" },
    }),
  ]);

  const applicable = consentTypes
    .filter((ct) => !ct.forMinorsOnly || activeMember.isMinor)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  const grantedByType = new Map(consents.map((c) => [c.consentTypeId, c]));

  return (
    <div className="flex flex-col gap-4">
      {members.length > 1 ? (
        <div className="flex gap-2">
          {members.map((m) => (
            <Link key={m.id} href={`/app/zgody?member=${m.id}`}>
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

      <ul className="flex flex-col gap-3">
        {applicable.map((ct) => {
          const granted = grantedByType.get(ct.id);
          return (
            <li key={ct.id} className="border-line bg-surface rounded-md border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-text font-medium">
                    {ct.label}
                    {ct.required ? "" : " (opcjonalna)"}
                  </p>
                  <div
                    className="text-muted-brand mt-1 text-sm"
                    dangerouslySetInnerHTML={{ __html: ct.bodyHtml }}
                  />
                  {granted ? (
                    <p className="text-jade mt-2 font-mono text-xs tracking-widest uppercase">
                      Podpisano {formatDate(granted.grantedAt)}
                    </p>
                  ) : null}
                </div>

                {granted ? (
                  <form action={revokeConsentAction}>
                    <input type="hidden" name="consentId" value={granted.id} />
                    <input type="hidden" name="memberId" value={activeMember.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Wycofaj
                    </Button>
                  </form>
                ) : (
                  <form action={grantConsentAction}>
                    <input type="hidden" name="consentTypeId" value={ct.id} />
                    <input type="hidden" name="memberId" value={activeMember.id} />
                    <Button type="submit" size="sm">
                      Podpisz
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
