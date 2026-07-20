import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { formatDate } from "@/lib/format";
import Link from "next/link";

// "Moje dziecko" (SPEC.md sekcja 3, rola GUARDIAN): ostatnia obecność,
// trener, kontakt. Wyłącznie do odczytu - dane zmienia trener/admin,
// a ustawienia powiadomień mieszkają w /app/powiadomienia.
export default async function MyChildPage() {
  const session = await requireRole("GUARDIAN");

  const children = await prisma.member.findMany({
    where: { guardianUserId: session.user.id },
    include: {
      ownerTrainer: { include: { user: true } },
      attendances: { orderBy: { checkedInAt: "desc" }, take: 1, include: { session: true } },
    },
    orderBy: { firstName: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-brand-red text-2xl tracking-wide">Moje dziecko</h1>

      {children.map((child) => {
        const lastAttendance = child.attendances[0];
        return (
          <section key={child.id} className="border-line bg-surface rounded-md border p-4">
            <p className="text-text font-medium">
              {child.firstName} {child.lastName}
            </p>
            <p className="text-muted-brand mt-1 text-sm">
              {lastAttendance
                ? `Ostatnia obecność: ${formatDate(lastAttendance.checkedInAt)} (${lastAttendance.session.name})`
                : "Brak zarejestrowanej obecności."}
            </p>
            <p className="text-muted-brand mt-1 text-sm">
              Trener-opiekun: {child.ownerTrainer.user.name}
              {child.ownerTrainer.user.phone ? ` · ${child.ownerTrainer.user.phone}` : ""}
              {child.ownerTrainer.user.email ? ` · ${child.ownerTrainer.user.email}` : ""}
            </p>
          </section>
        );
      })}
      {children.length === 0 ? (
        <p className="text-muted-brand text-sm">Nie masz jeszcze przypisanego dziecka w systemie.</p>
      ) : null}

      <section className="border-line bg-surface rounded-md border p-4">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Powiadomienia
        </h2>
        <p className="text-muted-brand mt-1 text-sm">
          Powiadomienie o wejściu dziecka na salę oraz pozostałe ustawienia znajdziesz w jednym
          miejscu: <Link href="/app/powiadomienia" className="text-brand-red underline">Powiadomienia</Link>.
        </p>
      </section>
    </div>
  );
}
