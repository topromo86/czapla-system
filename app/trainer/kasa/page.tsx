import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { classifyPassStatus } from "@/lib/domain/pass";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sellPassAction } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  NONE: "text-red",
  EXPIRING_SOON: "text-amber",
  ACTIVE: "text-jade",
};

// Ekran „Kasa" trenera - jedyne miejsce sprzedaży karnetu (płatności tylko u
// trenera, patrz lib/services/pass.ts#sellPass). Mobile-first: klient + plan +
// metoda + lokalizacja, jedno kliknięcie, ma działać w 15 s na sali.
export default async function TrainerKasaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { trainer } = await requireTrainerSelf();

  const [plans, locations, members] = await Promise.all([
    prisma.plan.findMany({ where: { active: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.member.findMany({
      where: {
        ownerTrainerId: trainer.id,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        passes: { where: { status: { in: ["ACTIVE", "FROZEN"] } }, orderBy: { endsAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-brand-red text-2xl tracking-wide">Kasa</h1>

      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Szukaj podopiecznego..."
          className="border-line bg-surface-2"
        />
        <Button type="submit" variant="outline">
          Szukaj
        </Button>
      </form>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const activePass = m.passes[0];
          const isFrozen = activePass?.status === "FROZEN";
          const availablePlans = plans.filter((p) => p.forMinors === m.isMinor);
          const badge = classifyPassStatus(!isFrozen ? (activePass ?? null) : null, now);

          return (
            <li key={m.id} className="border-line bg-surface flex flex-col gap-2 rounded-md border p-3">
              <div>
                <p className="text-text font-medium">
                  {m.firstName} {m.lastName}
                  {m.isMinor ? " (dziecko)" : ""}
                </p>
                {isFrozen ? (
                  <p className="text-muted-brand font-mono text-xs">Zamrożony</p>
                ) : (
                  <p className={`font-mono text-xs ${STATUS_STYLE[badge]}`}>
                    {activePass
                      ? `Aktywny karnet do ${formatDate(activePass.endsAt)}`
                      : "Brak aktywnego karnetu"}
                  </p>
                )}
              </div>
              <form action={sellPassAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="memberId" value={m.id} />
                <select
                  name="planId"
                  required
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-2 text-sm"
                >
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {(p.priceGross / 100).toFixed(0)} zł
                    </option>
                  ))}
                </select>
                <select
                  name="method"
                  required
                  defaultValue="CASH"
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-2 text-sm"
                >
                  <option value="CASH">Gotówka</option>
                  <option value="BLIK">BLIK</option>
                  <option value="TRANSFER">Przelew</option>
                </select>
                <select
                  name="locationId"
                  required
                  defaultValue={trainer.locationId}
                  className="border-line bg-surface-2 text-text rounded-md border px-2 py-2 text-sm"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="ml-auto">
                  Załóż karnet
                </Button>
              </form>
            </li>
          );
        })}
        {members.length === 0 ? (
          <li className="text-muted-brand text-sm">Brak podopiecznych.</li>
        ) : null}
      </ul>
    </div>
  );
}
