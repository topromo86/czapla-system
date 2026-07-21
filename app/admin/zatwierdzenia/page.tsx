import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { calculateAge } from "@/lib/domain/booking";
import { formatDate } from "@/lib/format";
import {
  approveLinkAction,
  approveMemberAction,
  rejectLinkAction,
  rejectMemberAction,
} from "./actions";

const STAN_MESSAGE: Record<string, { text: string; tone: "ok" | "err" }> = {
  ZATWIERDZONO: { text: "Konto zatwierdzone - klient może już się zapisywać.", tone: "ok" },
  ODRZUCONO_KONTO: { text: "Konto odrzucone.", tone: "ok" },
  POWIAZANO: { text: "Powiązano opiekuna z kontem dziecka.", tone: "ok" },
  ODRZUCONO_PROSBE: { text: "Prośba o powiązanie odrzucona.", tone: "ok" },
  MA_OPIEKUNA: {
    text: "To dziecko ma już przypisanego innego opiekuna - rozwiąż to na karcie klienta.",
    tone: "err",
  },
  BLAD: { text: "Nie udało się wykonać akcji (stan mógł się zmienić).", tone: "err" },
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ stan?: string }>;
}) {
  await requireRole("ADMIN");
  const { stan } = await searchParams;
  const message = stan ? STAN_MESSAGE[stan] : null;
  const now = new Date();

  const [pendingMembers, linkRequests] = await Promise.all([
    prisma.member.findMany({
      where: { approvalStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { ownerTrainer: { include: { user: true } }, homeLocation: true },
    }),
    prisma.guardianLinkRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        requester: { select: { name: true, email: true } },
        member: { select: { id: true, firstName: true, lastName: true, guardianUserId: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Zatwierdzenia</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Konta nieletnich z samodzielnej rejestracji oraz prośby rodziców o wgląd w grafik dziecka.
        </p>
      </div>

      {message ? (
        <p
          className={`rounded-md border p-3 text-sm ${
            message.tone === "ok"
              ? "border-jade/40 bg-jade/10 text-text"
              : "border-red/40 bg-red/10 text-red"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Konta nieletnich do zatwierdzenia ({pendingMembers.length})
        </h2>
        {pendingMembers.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface rounded-md border p-3 text-sm">
            Brak kont oczekujących na zatwierdzenie.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingMembers.map((m) => (
              <li
                key={m.id}
                className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-text font-medium">
                    {m.firstName} {m.lastName}{" "}
                    <span className="text-muted-brand font-mono text-xs">
                      ({calculateAge(m.birthDate, now)} lat)
                    </span>
                  </p>
                  <p className="text-muted-brand mt-0.5 font-mono text-xs">
                    {m.email ?? "brak e-maila"} · {m.homeLocation.name} · trener{" "}
                    {m.ownerTrainer.user.name} · zgłoszone {formatDate(m.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={approveMemberAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <Button type="submit" size="sm">
                      Zatwierdź
                    </Button>
                  </form>
                  <form action={rejectMemberAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Odrzuć
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Prośby rodziców o powiązanie ({linkRequests.length})
        </h2>
        {linkRequests.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface rounded-md border p-3 text-sm">
            Brak próśb o powiązanie.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linkRequests.map((r) => (
              <li
                key={r.id}
                className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-text text-sm">
                    <b>{r.requester.name}</b> ({r.requester.email}) prosi o wgląd w grafik dziecka
                  </p>
                  <p className="text-muted-brand mt-0.5 font-mono text-xs">
                    e-mail dziecka: {r.childEmail} · zgłoszone {formatDate(r.createdAt)}
                  </p>
                  {r.member ? (
                    <p className="text-jade mt-1 text-xs">
                      Dopasowana kartoteka: {r.member.firstName} {r.member.lastName}
                      {r.member.guardianUserId ? " · UWAGA: ma już opiekuna" : ""}
                    </p>
                  ) : (
                    <p className="text-amber mt-1 text-xs">
                      Brak jednoznacznej kartoteki dla tego adresu - sprawdź adres albo powiąż
                      ręcznie na karcie klienta.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.member ? (
                    <form action={approveLinkAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="memberId" value={r.member.id} />
                      <Button type="submit" size="sm">
                        Powiąż
                      </Button>
                    </form>
                  ) : null}
                  <form action={rejectLinkAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Odrzuć
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
