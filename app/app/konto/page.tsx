import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { requestGuardianLinkAction } from "./actions";

// Komunikaty po wysłaniu prośby (kod w ?req=). Trzymamy je tu, blisko widoku.
const REQ_MESSAGE: Record<string, { text: string; tone: "ok" | "err" }> = {
  WYSLANO: {
    text: "Prośba wysłana. Klub potwierdzi powiązanie - wtedy zobaczysz grafik dziecka.",
    tone: "ok",
  },
  ZLY_EMAIL: { text: "Podaj poprawny adres e-mail dziecka.", tone: "err" },
  TO_TY: { text: "To Twój własny adres - podaj adres dziecka.", tone: "err" },
  JUZ_POWIAZANE: { text: "To dziecko jest już powiązane z Twoim kontem.", tone: "err" },
  JUZ_WYSLANE: { text: "Prośba o ten adres już czeka na potwierdzenie.", tone: "err" },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Oczekuje na potwierdzenie klubu",
  REJECTED: "Odrzucona przez klub",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string }>;
}) {
  const session = await requireRole("MEMBER", "GUARDIAN");
  const { req } = await searchParams;
  const message = req ? REQ_MESSAGE[req] : null;

  const [children, requests] = await Promise.all([
    prisma.member.findMany({
      where: { guardianUserId: session.user.id },
      orderBy: { firstName: "asc" },
      include: { ownerTrainer: { include: { user: true } } },
    }),
    // Otwarte i odrzucone prośby zostają widoczne (odrzucone bez pary z aktywnym
    // powiązaniem), zatwierdzone znikają - dziecko pojawia się wtedy na liście.
    prisma.guardianLinkRequest.findMany({
      where: { requesterUserId: session.user.id, status: { in: ["PENDING", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-brand-red text-2xl tracking-wide">Konto</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Rodzic - grafik dziecka
        </h2>
        <p className="text-muted-brand text-sm">
          Jeśli Twoje dziecko trenuje w klubie, poproś o dostęp do jego grafiku. Podaj adres e-mail,
          na który założone jest konto dziecka. Klub potwierdzi powiązanie - dopiero wtedy zobaczysz
          jego zajęcia (także obok swoich, jeśli sam(a) trenujesz).
        </p>

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

        {children.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {children.map((child) => (
              <li
                key={child.id}
                className="border-jade/40 bg-jade/5 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span className="text-text font-medium">
                  {child.firstName} {child.lastName}
                </span>
                <span className="text-muted-brand font-mono text-xs">
                  Powiązane · trener {child.ownerTrainer.user.name}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {requests.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="border-line bg-surface flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span className="text-text text-sm">{r.childEmail}</span>
                <span
                  className={`font-mono text-xs ${
                    r.status === "REJECTED" ? "text-red" : "text-amber"
                  }`}
                >
                  {STATUS_LABEL[r.status]} · {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <form
          action={requestGuardianLinkAction}
          className="border-line bg-surface flex flex-col gap-2 rounded-md border p-4"
        >
          <Label htmlFor="childEmail" className="font-mono text-xs tracking-widest uppercase">
            E-mail dziecka
          </Label>
          <Input
            id="childEmail"
            name="childEmail"
            type="email"
            required
            placeholder="np. dziecko@example.com"
            className="border-line bg-surface-2"
          />
          <Button type="submit" size="sm" className="self-start">
            Poproś o powiązanie
          </Button>
        </form>
      </section>
    </div>
  );
}
