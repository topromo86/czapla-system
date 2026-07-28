import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import { addCalendarDays, todayInTimeZone, zonedTimeToUtc } from "@/lib/domain/time";
import { formatMoney } from "@/lib/format";

// Pulpit właściciela - ekran startowy admina po zalogowaniu. Dwie rzeczy naraz:
// szybki obraz kondycji klubu (KPI) i lista tego, co dziś wymaga jego decyzji
// (zatwierdzenia, zastępstwa, alerty). Wszystko klikalne, prowadzi w jedno
// kliknięcie do właściwego ekranu. Strona serwerowa, bez JS.

function fullDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function time(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminDashboardPage() {
  const session = await requireRole("ADMIN");
  const now = new Date();
  const today = todayInTimeZone(now);
  const tomorrow = addCalendarDays(today, 1);
  const monthStart = zonedTimeToUtc(today.year, today.month, 1, 0, 0);
  const todayStart = zonedTimeToUtc(today.year, today.month, today.day, 0, 0);
  const todayEnd = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0);

  const [
    membersActive,
    newThisMonth,
    activePasses,
    activeTrainers,
    revenueMonth,
    todaySessions,
    pendingMinors,
    pendingLinks,
    substituteAlerts,
    openRetentionTasks,
  ] = await Promise.all([
    prisma.member.count({ where: { status: "ACTIVE" } }),
    prisma.member.count({ where: { joinedAt: { gte: monthStart } } }),
    prisma.pass.count({ where: { status: "ACTIVE" } }),
    prisma.trainer.count({ where: { active: true } }),
    prisma.payment.aggregate({
      _sum: { amountGross: true },
      where: { recordedAt: { gte: monthStart, lt: todayEnd } },
    }),
    prisma.session.findMany({
      where: { startsAt: { gte: todayStart, lt: todayEnd }, status: "SCHEDULED" },
      include: {
        trainer: { include: { user: true } },
        substituteTrainer: { include: { user: true } },
        location: true,
        bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } }, select: { id: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.member.count({ where: { approvalStatus: "PENDING" } }),
    prisma.guardianLinkRequest.count({ where: { status: "PENDING" } }),
    prisma.session.count({
      where: {
        substituteStatus: { in: ["PENDING", "DECLINED"] },
        startsAt: { gte: now },
        status: "SCHEDULED",
      },
    }),
    prisma.retentionTask.count({ where: { closedAt: null } }),
  ]);

  const revenue = revenueMonth._sum.amountGross ?? 0;
  const bookedToday = todaySessions.reduce((sum, s) => sum + s.bookings.length, 0);
  const capacityToday = todaySessions.reduce((sum, s) => sum + s.capacity, 0);

  const kpis = [
    { label: "Aktywni klubowicze", value: String(membersActive), hint: `+${newThisMonth} w tym miesiącu` },
    { label: "Przychód (ten miesiąc)", value: formatMoney(revenue), hint: "wpłaty od 1. dnia" },
    {
      label: "Zajęcia dziś",
      value: String(todaySessions.length),
      hint: todaySessions.length > 0 ? `${bookedToday}/${capacityToday} miejsc zajętych` : "brak w grafiku",
    },
    { label: "Aktywne karnety", value: String(activePasses), hint: `${activeTrainers} trenerów w kadrze` },
  ];

  const attention = [
    {
      count: pendingMinors,
      label: "Konta nieletnich do zatwierdzenia",
      href: "/admin/zatwierdzenia",
    },
    { count: pendingLinks, label: "Prośby rodziców o powiązanie", href: "/admin/zatwierdzenia" },
    { count: substituteAlerts, label: "Zastępstwa do potwierdzenia", href: "/admin/zastepstwa" },
    { count: openRetentionTasks, label: "Otwarte alerty retencji", href: "/admin/retencja" },
  ].filter((a) => a.count > 0);

  const shortcuts = [
    { label: "Dodaj klienta", href: "/admin/klienci/nowy" },
    { label: "Kasa", href: "/admin/kasa" },
    { label: "Grafik zajęć", href: "/admin/zajecia" },
    { label: "Obłożenie sal", href: "/admin/oblozenie" },
    { label: "Finanse", href: "/admin/finanse" },
    { label: "Zatwierdzenia", href: "/admin/zatwierdzenia" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">
          Cześć, {session.user.name?.split(" ")[0] ?? "Admin"}
        </h1>
        <p className="text-muted-brand mt-1 text-sm capitalize">{fullDate(now)}</p>
      </div>

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="border-line bg-surface rounded-md border p-4">
            <p className="text-muted-brand font-mono text-[11px] tracking-widest uppercase">
              {k.label}
            </p>
            <p className="text-text font-display mt-2 text-2xl">{k.value}</p>
            <p className="text-muted-brand mt-1 text-xs">{k.hint}</p>
          </div>
        ))}
      </section>

      {/* Wymaga uwagi */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Wymaga Twojej uwagi
        </h2>
        {attention.length === 0 ? (
          <p className="border-jade/40 bg-jade/10 text-text rounded-md border p-4 text-sm">
            Wszystko ogarnięte - żadnych zaległych decyzji. 👊
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="border-amber bg-amber/5 hover:bg-amber/10 flex items-center justify-between gap-3 rounded-md border p-3 transition"
                >
                  <span className="text-text text-sm">{a.label}</span>
                  <span className="bg-amber text-surface flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold">
                    {a.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dziś na sali */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Dziś na sali ({todaySessions.length})
        </h2>
        {todaySessions.length === 0 ? (
          <p className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
            Dziś nie ma zajęć w grafiku. Rozpiskę ustawisz w{" "}
            <Link href="/admin/zajecia" className="text-brand-red underline">
              Grafiku zajęć
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todaySessions.map((s) => {
              const full = s.bookings.length >= s.capacity;
              const runner =
                s.substituteStatus === "ACCEPTED" && s.substituteTrainer
                  ? s.substituteTrainer.user.name
                  : s.trainer.user.name;
              return (
                <li
                  key={s.id}
                  className="border-line bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-text font-medium">
                      <span className="text-muted-brand font-mono text-xs">{time(s.startsAt)}</span>{" "}
                      {s.name}
                    </p>
                    <p className="text-muted-brand mt-0.5 font-mono text-xs">
                      {s.location.name} · {runner}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-xs tracking-widest uppercase ${
                      full ? "text-amber" : "text-jade"
                    }`}
                  >
                    {s.bookings.length}/{s.capacity} {full ? "komplet" : "miejsc"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Szybkie akcje */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Szybkie akcje
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="border-line bg-surface hover:border-brand-red hover:text-brand-red text-text flex items-center justify-center rounded-md border p-4 text-center text-sm font-medium transition"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
