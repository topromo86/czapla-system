import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateAge } from "@/lib/domain/booking";
import { daysSince } from "@/lib/domain/retention";
import { MEMBER_LEVELS, MEMBER_LEVEL_LABEL } from "@/lib/domain/member-level";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  anonymizeMemberAction,
  confirmConsentDeliveryAction,
  markReferralRewardedAction,
  provisionLoginAccountAction,
  updateMemberAction,
} from "./actions";

const REFERRAL_STATUS_LABEL: Record<string, string> = {
  SENT: "Wysłany",
  REGISTERED: "Zarejestrowany",
  CONVERTED: "Zrealizowany",
  REWARDED: "Nagrodzony",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktywny",
  FROZEN: "Zamrożony",
  CHURNED: "Odszedł(a)",
};

const PASS_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktywny",
  FROZEN: "Zamrożony",
  EXPIRED: "Wygasły",
  CANCELLED: "Anulowany",
};

function formatTenure(joinedAt: Date | null, now: Date): string {
  if (!joinedAt) return "Jeszcze nie dołączył(a) - brak pierwszej płatności lub obecności.";
  const days = daysSince(joinedAt, now)!;
  return `Od ${formatDate(joinedAt)} (${days} dni)`;
}

export default async function AdminMemberCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ konto?: string; "konto-blad"?: string }>;
}) {
  const { memberId } = await params;
  const query = await searchParams;

  const [member, locations, trainers] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { email: true } },
        ownerTrainer: { include: { user: true } },
        homeLocation: true,
        passes: { orderBy: { endsAt: "desc" }, include: { plan: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 5, include: { authorUser: true } },
        referralsMade: { orderBy: { createdAt: "desc" }, include: { refereeMember: true } },
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.trainer.findMany({
      where: { active: true },
      include: { user: true, location: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  if (!member) notFound();

  const now = new Date();
  const age = calculateAge(member.birthDate, now);

  // Hasło świeżo założonego konta - jednorazowo z ciasteczka (nie z URL).
  let provisioned: { email: string; password: string; emailed: boolean } | null = null;
  if (query.konto === "utworzone") {
    const raw = (await cookies()).get("provisioned-account")?.value;
    if (raw) {
      try {
        provisioned = JSON.parse(raw);
      } catch {
        provisioned = null;
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <Link href="/admin" className="text-muted-brand text-xs hover:text-brand-red">
          ← Karnety
        </Link>
        <h1 className="font-display text-brand-red mt-1 text-2xl tracking-wide">
          {member.firstName} {member.lastName}
        </h1>
        <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
          {age} lat · {member.sex === "FEMALE" ? "Kobieta" : member.sex === "MALE" ? "Mężczyzna" : "?"}
          {member.isMinor ? " · Niepełnoletni" : ""} · Poziom {MEMBER_LEVEL_LABEL[member.level]} · Status{" "}
          {STATUS_LABEL[member.status]}
        </p>
        <p className="text-muted-brand mt-1 text-sm">
          Opiekun: {member.ownerTrainer.user.name} · Lokalizacja domowa: {member.homeLocation.name}
        </p>
        <p className="mt-2 text-sm">
          <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Cel:{" "}
          </span>
          {member.goal ? member.goal : <span className="text-red">brak ustalonego celu</span>}
        </p>
        <p className="text-muted-brand mt-1 text-sm">{formatTenure(member.joinedAt, now)}</p>
      </section>

      <section
        className={`rounded-md border p-4 ${
          member.consentsDeliveredAt ? "border-line bg-surface" : "border-amber bg-amber/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Podpisane zgody
            </h2>
            {member.consentsDeliveredAt ? (
              <p className="text-jade mt-1 text-sm">
                Odbiór potwierdzony: {formatDate(member.consentsDeliveredAt)}.
              </p>
            ) : (
              <p className="text-amber mt-1 text-sm">
                Brak podpisanego wydruku. Do potwierdzenia klient zapisze się tylko na pierwsze
                zajęcia.
              </p>
            )}
          </div>
          {!member.consentsDeliveredAt ? (
            <form action={confirmConsentDeliveryAction}>
              <input type="hidden" name="memberId" value={member.id} />
              <Button type="submit" size="sm">
                Potwierdź odbiór zgód
              </Button>
            </form>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Karnety ({member.passes.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {member.passes.map((p) => (
            <li
              key={p.id}
              className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-text font-medium">{p.plan.name}</span>
              <span className="text-muted-brand font-mono text-xs">
                {formatDate(p.startsAt)} - {formatDate(p.endsAt)} · {PASS_STATUS_LABEL[p.status]}
              </span>
            </li>
          ))}
          {member.passes.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak karnetów - jeszcze żaden nie sprzedany.</li>
          ) : null}
        </ul>
      </section>

      {member.notes.length > 0 ? (
        <section>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Ostatnie notatki trenera
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {member.notes.map((note) => (
              <li key={note.id} className="border-line bg-surface rounded-md border p-3">
                <p className="text-muted-brand font-mono text-xs tracking-widest uppercase">
                  {note.kind} · {note.authorUser.name} · {formatDate(note.createdAt)}
                </p>
                <p className="text-text mt-1 text-sm">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {member.referralsMade.length > 0 ? (
        <section>
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Polecenia
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {member.referralsMade.map((r) => (
              <li
                key={r.id}
                className="border-line bg-surface flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <span className="text-text font-mono font-medium">{r.code}</span>
                  <span className="text-muted-brand ml-2 text-sm">
                    {REFERRAL_STATUS_LABEL[r.status] ?? r.status}
                    {r.refereeMember
                      ? ` - ${r.refereeMember.firstName} ${r.refereeMember.lastName}`
                      : ""}
                  </span>
                </div>
                {r.status === "CONVERTED" ? (
                  <form action={markReferralRewardedAction}>
                    <input type="hidden" name="referralId" value={r.id} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Oznacz jako nagrodzone
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Edytuj dane klienta
        </h2>
        <form action={updateMemberAction} className="mt-2 flex max-w-lg flex-col gap-4">
          <input type="hidden" name="memberId" value={member.id} />
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="firstName">Imię</Label>
              <Input
                id="firstName"
                name="firstName"
                required
                defaultValue={member.firstName}
                className="border-line bg-surface-2"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="lastName">Nazwisko</Label>
              <Input
                id="lastName"
                name="lastName"
                required
                defaultValue={member.lastName}
                className="border-line bg-surface-2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">E-mail (kontakt)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={member.email ?? ""}
              className="border-line bg-surface-2"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="birthDate">Data urodzenia</Label>
              <Input
                id="birthDate"
                name="birthDate"
                type="date"
                required
                defaultValue={member.birthDate.toISOString().slice(0, 10)}
                className="border-line bg-surface-2"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="sex">Płeć</Label>
              <select
                id="sex"
                name="sex"
                required
                defaultValue={member.sex ?? "FEMALE"}
                className="border-line bg-surface-2 text-text w-full rounded-md border px-2 py-2 text-sm"
              >
                <option value="FEMALE">Kobieta</option>
                <option value="MALE">Mężczyzna</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="level">Poziom</Label>
              <select
                id="level"
                name="level"
                required
                defaultValue={member.level}
                className="border-line bg-surface-2 text-text w-full rounded-md border px-2 py-2 text-sm"
              >
                {MEMBER_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                required
                defaultValue={member.status}
                className="border-line bg-surface-2 text-text w-full rounded-md border px-2 py-2 text-sm"
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="weightKg">Waga (kg, opcjonalnie)</Label>
            <Input
              id="weightKg"
              name="weightKg"
              type="number"
              step="0.1"
              min="0"
              defaultValue={member.weightKg ?? ""}
              className="border-line bg-surface-2"
            />
          </div>

          <div>
            <Label htmlFor="goal">Cel (opcjonalnie)</Label>
            <Input
              id="goal"
              name="goal"
              defaultValue={member.goal ?? ""}
              className="border-line bg-surface-2"
            />
          </div>

          <div>
            <Label htmlFor="homeLocationId">Lokalizacja domowa</Label>
            <select
              id="homeLocationId"
              name="homeLocationId"
              required
              defaultValue={member.homeLocationId}
              className="border-line bg-surface-2 text-text w-full rounded-md border px-2 py-2 text-sm"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="ownerTrainerId">Trener-opiekun</Label>
            <select
              id="ownerTrainerId"
              name="ownerTrainerId"
              required
              defaultValue={member.ownerTrainerId}
              className="border-line bg-surface-2 text-text w-full rounded-md border px-2 py-2 text-sm"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.name} ({t.location.name})
                </option>
              ))}
            </select>
            <p className="text-muted-brand mt-1 text-xs">
              Każdy klient musi mieć jednego odpowiedzialnego trenera (CLAUDE.md reguła 1).
            </p>
          </div>

          <Button type="submit" className="self-start">
            Zapisz zmiany
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Konto logowania
        </h2>

        {query["konto-blad"] ? (
          <p className="border-red bg-surface text-text mt-2 rounded-md border p-3 text-sm">
            <b className="text-red">Błąd:</b> {query["konto-blad"]}
          </p>
        ) : null}

        {provisioned ? (
          <div className="border-jade bg-surface mt-2 rounded-md border p-3 text-sm">
            <p className="text-text font-medium">Konto założone.</p>
            <div className="text-muted-brand mt-2 flex flex-col gap-1 font-mono text-xs">
              <span>
                Login: <b className="text-text">{provisioned.email}</b>
              </span>
              <span>
                Hasło tymczasowe: <b className="text-text">{provisioned.password}</b>
              </span>
            </div>
            <p className="text-muted-brand mt-2">
              {provisioned.emailed
                ? "Dane wysłane też mailem. "
                : "Poczta nieaktywna - przekaż hasło klientowi osobiście. "}
              Zapisz hasło teraz - zniknie po chwili.
            </p>
          </div>
        ) : member.userId ? (
          <p className="text-muted-brand mt-2 text-sm">
            Klient ma konto logowania
            {member.user?.email ? (
              <>
                {" "}
                (<b className="text-text">{member.user.email}</b>)
              </>
            ) : null}
            . Hasło zmienia sam przez &bdquo;Nie pamiętasz hasła?&rdquo; na ekranie logowania.
          </p>
        ) : (
          <form action={provisionLoginAccountAction} className="mt-2 flex flex-col gap-3">
            <input type="hidden" name="memberId" value={member.id} />
            <p className="text-muted-brand text-sm">
              Ten klient nie ma jeszcze konta w aplikacji. Podaj e-mail - wygenerujemy hasło,
              wyślemy je na ten adres i pokażemy tutaj.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="provision-email" className="font-mono text-xs tracking-widest uppercase">
                  E-mail klienta
                </Label>
                <Input
                  id="provision-email"
                  name="email"
                  type="email"
                  required
                  defaultValue={member.email ?? ""}
                  className="border-line bg-surface-2 w-64"
                />
              </div>
              <Button type="submit">Załóż konto i wyślij hasło</Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          RODO
        </h2>
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <a
              href={`/api/admin/export-member/${member.id}`}
              className="text-brand-red text-sm underline underline-offset-2"
            >
              Pobierz pełny eksport danych (JSON)
            </a>
          </div>

          <form
            action={anonymizeMemberAction}
            className="border-red/30 bg-red/5 flex flex-col gap-2 rounded-md border p-3"
          >
            <input type="hidden" name="memberId" value={member.id} />
            <p className="text-red text-sm font-medium">
              Usunięcie danych osobowych (nieodwracalne)
            </p>
            <p className="text-muted-brand text-xs">
              Czyści imię, nazwisko, kontakt, cel i wagę. Historia płatności i obecności zostaje
              zachowana (obowiązek księgowy), ale przestaje być powiązana z tożsamością klienta.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmed" required className="size-4" />
              Potwierdzam, że klient poprosił o usunięcie danych
            </label>
            <Button type="submit" variant="destructive" size="sm" className="self-start">
              Usuń dane osobowe
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
