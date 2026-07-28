import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLeadAccess } from "@/lib/auth/guard";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, LEAD_STATUS_ORDER } from "@/lib/domain/lead-import";
import { formatDate, formatDayTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addLeadNoteAction,
  assignLeadAction,
  clearReminderAction,
  setReminderAction,
  updateStatusAction,
} from "../actions";

const selectClass = "border-line bg-surface-2 text-text rounded-md border px-2 py-1.5 text-sm";

export default async function LeadCardPage({ params }: { params: Promise<{ leadId: string }> }) {
  await requireLeadAccess();
  const { leadId } = await params;

  const [lead, assignees] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        convertedMember: { select: { id: true, firstName: true, lastName: true } },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
        activities: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { OR: [{ role: "ADMIN" }, { role: "TRAINER", canAccessLeads: true }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!lead) notFound();

  const raw = (lead.rawData ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/leady" className="text-muted-brand text-xs hover:text-brand-red">
          ← Leady
        </Link>
        <h1 className="font-display text-brand-red mt-1 text-2xl tracking-wide">{lead.fullName}</h1>
        <p className="text-muted-brand mt-1 font-mono text-xs tracking-widest uppercase">
          {LEAD_SOURCE_LABEL[lead.source]}
          {lead.campaign ? ` · ${lead.campaign}` : ""} · zaimportowano {formatDate(lead.importedAt)}
        </p>
      </div>

      {/* Dane kontaktowe */}
      <section className="border-line bg-surface grid grid-cols-1 gap-2 rounded-md border p-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-brand">Telefon: </span>
          {lead.phone ? (
            <a href={`tel:${lead.phone}`} className="text-brand-red font-medium">
              {lead.phone}
            </a>
          ) : (
            <span className="text-muted-brand">brak</span>
          )}
        </div>
        <div>
          <span className="text-muted-brand">E-mail: </span>
          {lead.email ? (
            <a href={`mailto:${lead.email}`} className="text-brand-red font-medium">
              {lead.email}
            </a>
          ) : (
            <span className="text-muted-brand">brak</span>
          )}
        </div>
        {lead.convertedMember ? (
          <div className="sm:col-span-2">
            <span className="text-jade">Konto założone: </span>
            <Link
              href={`/admin/klienci/${lead.convertedMember.id}`}
              className="text-brand-red underline"
            >
              {lead.convertedMember.firstName} {lead.convertedMember.lastName}
            </Link>
          </div>
        ) : null}
        {Object.keys(raw).length > 0 ? (
          <details className="sm:col-span-2">
            <summary className="text-muted-brand cursor-pointer text-xs">
              Wszystkie pola z importu ({Object.keys(raw).length})
            </summary>
            <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {Object.entries(raw).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-muted-brand">{k}: </span>
                  <span className="text-text">{v}</span>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>

      {/* Status */}
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Status</h2>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUS_ORDER.map((s) => (
            <form key={s} action={updateStatusAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={lead.status === s}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  lead.status === s
                    ? "border-brand-red text-brand-red font-medium"
                    : "border-line bg-surface text-text hover:border-brand-red"
                } disabled:cursor-default`}
              >
                {LEAD_STATUS_LABEL[s]}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Przypomnienie + Przypisanie */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border-line bg-surface flex flex-col gap-2 rounded-md border p-4">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
            Ponowny kontakt
          </h2>
          {lead.reminderAt ? (
            <p className="text-amber text-sm">
              Umówiony na {formatDayTime(lead.reminderAt)}.
              <form action={clearReminderAction} className="mt-1">
                <input type="hidden" name="leadId" value={lead.id} />
                <button type="submit" className="text-muted-brand text-xs hover:text-brand-red">
                  Usuń przypomnienie
                </button>
              </form>
            </p>
          ) : (
            <p className="text-muted-brand text-xs">
              Nie może teraz rozmawiać? Ustaw termin ponownego kontaktu - lead trafi na górę listy.
            </p>
          )}
          <form action={setReminderAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="datetime-local" name="reminder" required className={selectClass} />
            <Button type="submit" size="sm" variant="outline">
              Ustaw
            </Button>
          </form>
        </div>

        <div className="border-line bg-surface flex flex-col gap-2 rounded-md border p-4">
          <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">Opiekun</h2>
          <form action={assignLeadAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="assignedToUserId" defaultValue={lead.assignedToUserId ?? ""} className={selectClass}>
              <option value="">Nieprzypisany</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Zapisz
            </Button>
          </form>
        </div>
      </section>

      {/* Notatki */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Notatki (widoczne tylko dla zespołu)
        </h2>
        <form action={addLeadNoteAction} className="flex flex-col gap-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <Textarea
            name="body"
            rows={2}
            required
            placeholder="Co ustalono w rozmowie…"
            className="border-line bg-surface-2"
          />
          <Button type="submit" size="sm" className="self-start">
            Dodaj notatkę
          </Button>
        </form>
        {lead.notes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {lead.notes.map((n) => (
              <li key={n.id} className="border-line bg-surface rounded-md border p-3">
                <p className="text-text text-sm whitespace-pre-wrap">{n.body}</p>
                <p className="text-muted-brand mt-1 font-mono text-[10px] uppercase">
                  {n.author.name} · {formatDayTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-brand text-sm">Brak notatek.</p>
        )}
      </section>

      {/* Historia */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Historia aktywności
        </h2>
        <ul className="flex flex-col gap-1.5">
          {lead.activities.map((a) => (
            <li key={a.id} className="text-muted-brand flex flex-wrap gap-x-2 text-xs">
              <span className="font-mono">{formatDayTime(a.createdAt)}</span>
              <span className="text-text">{a.summary}</span>
              {a.actor ? <span>· {a.actor.name}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
