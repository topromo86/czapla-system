import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PushSubscribeButton } from "./push-subscribe-button";
import { updateNotificationPrefsAction } from "./actions";

// "Moje dziecko" (SPEC.md sekcja 3, rola GUARDIAN): ostatnia obecność,
// trener, kontakt, ustawienia powiadomień. Wyłącznie do odczytu poza samymi
// ustawieniami powiadomień - reszta danych zmienia trener/admin.
export default async function MyChildPage() {
  const session = await requireRole("GUARDIAN");

  const [children, guardianUser] = await Promise.all([
    prisma.member.findMany({
      where: { guardianUserId: session.user.id },
      include: {
        ownerTrainer: { include: { user: true } },
        attendances: { orderBy: { checkedInAt: "desc" }, take: 1, include: { session: true } },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
  ]);

  const smsAvailable = Boolean(process.env.SMS_PROVIDER_API_KEY);

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

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Powiadomienia: dziecko weszło na salę
        </h2>
        <p className="text-muted-brand mt-1 text-sm">
          Dotyczy wszystkich Twoich dzieci w klubie. Push działa od razu po włączeniu na tym
          urządzeniu; SMS to zapasowy kanał na wypadek, gdyby push nie doszedł.
        </p>

        <div className="mt-3">
          <PushSubscribeButton isSubscribed={guardianUser.pushSubscription != null} />
        </div>

        <form action={updateNotificationPrefsAction} className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="checkInNotifyPush"
              defaultChecked={guardianUser.checkInNotifyPush}
              className="size-4"
            />
            Powiadomienia push włączone
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="checkInNotifySms"
              defaultChecked={guardianUser.checkInNotifySms}
              className="size-4"
            />
            Fallback SMS włączony
            {!smsAvailable ? (
              <span className="text-amber font-mono text-xs uppercase">
                (klub nie ma jeszcze dostawcy SMS - nic nie wyśle)
              </span>
            ) : null}
          </label>
          <Button type="submit" size="sm" className="self-start">
            Zapisz ustawienia
          </Button>
        </form>
      </section>
    </div>
  );
}
