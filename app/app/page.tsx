import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { hasRequiredConsents, requiredConsentKeys } from "@/lib/domain/booking";
import { Button } from "@/components/ui/button";
import { bookSessionAction, cancelBookingAction } from "./actions";

const DAYS_AHEAD = 7;

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_BOOKED: "Jesteś już zapisany na te zajęcia.",
  SESSION_CANCELLED: "Te zajęcia zostały odwołane.",
  ALREADY_STARTED: "Te zajęcia już się rozpoczęły.",
  MISSING_CONSENTS: "Brakuje wymaganych zgód - uzupełnij je w zakładce Zgody.",
  NO_ACTIVE_PASS: "Brak aktywnego karnetu - skontaktuj się z klubem.",
  AGE_NOT_ELIGIBLE: "Wiek nie pasuje do tej grupy zajęciowej.",
};

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(date);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; location?: string; error?: string }>;
}) {
  const params = await searchParams;
  const members = await getAccessibleMembers();
  if (members.length === 0) return null; // layout już pokazał komunikat

  const activeMember = members.find((m) => m.id === params.member) ?? members[0];
  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });
  const activeLocationId = params.location ?? activeMember.homeLocationId;

  const grantedConsents = await prisma.consent.findMany({
    where: { memberId: activeMember.id, revokedAt: null },
    include: { consentType: true },
  });
  const grantedKeys = new Set(grantedConsents.map((c) => c.consentType.key));
  const missingConsents = !hasRequiredConsents(
    grantedKeys,
    requiredConsentKeys(activeMember.isMinor),
  );

  const now = new Date();
  const windowEnd = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);

  const sessions = await prisma.session.findMany({
    where: {
      locationId: activeLocationId,
      status: "SCHEDULED",
      startsAt: { gte: now, lt: windowEnd },
    },
    include: {
      template: true,
      trainer: { include: { user: true } },
      bookings: true,
    },
    orderBy: { startsAt: "asc" },
  });

  const relevant = sessions.filter((s) =>
    s.template ? s.template.isKids === activeMember.isMinor : true,
  );

  const returnTo = `/app?member=${activeMember.id}&location=${activeLocationId}`;

  const groups = new Map<string, typeof relevant>();
  for (const s of relevant) {
    const key = dayKey(s.startsAt);
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  async function switchTo(memberId: string, locationId: string) {
    "use server";
    redirect(`/app?member=${memberId}&location=${locationId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {members.length > 1 ? (
        <div className="flex gap-2">
          {members.map((m) => (
            <form key={m.id} action={switchTo.bind(null, m.id, activeLocationId)}>
              <Button
                type="submit"
                variant={m.id === activeMember.id ? "default" : "outline"}
                size="sm"
              >
                {m.firstName}
              </Button>
            </form>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        {locations.map((loc) => (
          <form key={loc.id} action={switchTo.bind(null, activeMember.id, loc.id)}>
            <Button
              type="submit"
              variant={loc.id === activeLocationId ? "default" : "outline"}
              size="sm"
            >
              {loc.name}
            </Button>
          </form>
        ))}
      </div>

      {params.error ? (
        <p role="alert" className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          {ERROR_MESSAGES[params.error] ?? "Nie udało się wykonać akcji."}
        </p>
      ) : null}

      {missingConsents ? (
        <p className="border-brand-red/40 bg-brand-red/10 text-text rounded-md border p-3 text-sm">
          Brakuje kompletu wymaganych zgód dla {activeMember.firstName} - uzupełnij je w zakładce{" "}
          <Link href={`/app/zgody?member=${activeMember.id}`} className="text-brand-red underline">
            Zgody
          </Link>
          , inaczej zapis na zajęcia się nie powiedzie.
        </p>
      ) : null}

      {groups.size === 0 ? (
        <p className="text-muted-brand">Brak zajęć w tej lokalizacji w najbliższych 7 dniach.</p>
      ) : null}

      {[...groups.entries()].map(([key, daySessions]) => (
        <section key={key} className="flex flex-col gap-2">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            {formatDay(daySessions[0].startsAt)}
          </h2>
          <ul className="flex flex-col gap-2">
            {daySessions.map((s) => {
              const myBooking = s.bookings.find(
                (b) =>
                  b.memberId === activeMember.id &&
                  (b.status === "BOOKED" || b.status === "WAITLIST"),
              );
              const bookedCount = s.bookings.filter((b) => b.status === "BOOKED").length;
              const isFull = bookedCount >= s.capacity;

              return (
                <li
                  key={s.id}
                  className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-text font-medium">{s.name}</p>
                    <p className="text-muted-brand font-mono text-xs">
                      {formatTime(s.startsAt)} · {s.trainer.user.name} · {bookedCount}/{s.capacity}
                    </p>
                  </div>

                  {myBooking ? (
                    <form action={cancelBookingAction} className="flex items-center gap-2">
                      <input type="hidden" name="bookingId" value={myBooking.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <span className="text-jade font-mono text-xs tracking-widest uppercase">
                        {myBooking.status === "WAITLIST" ? "Lista rezerwowa" : "Zapisany"}
                      </span>
                      <Button type="submit" variant="outline" size="sm">
                        Odwołaj
                      </Button>
                    </form>
                  ) : (
                    <form action={bookSessionAction}>
                      <input type="hidden" name="memberId" value={activeMember.id} />
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" size="sm">
                        {isFull ? "Lista rezerwowa" : "Zapisz się"}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
