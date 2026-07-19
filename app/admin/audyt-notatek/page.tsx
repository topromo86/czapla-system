import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { markNoteReviewedAction } from "./actions";

// Audyt jakości (SPEC.md sekcja 2): 10% losowych notatek CONTACT miesięcznie
// do przeglądu przez właściciela - "bez tego trenerzy zaczną wklejać
// formułki". Losowanie wykonuje job computeScores (flaggedForAudit).
export default async function NoteAuditPage() {
  const [pending, reviewed] = await Promise.all([
    prisma.note.findMany({
      where: { flaggedForAudit: true, reviewedAt: null },
      include: { member: true, authorUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: { flaggedForAudit: true, reviewedAt: { not: null } },
      include: { member: true, authorUser: true },
      orderBy: { reviewedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-brand-red text-2xl tracking-wide">Audyt notatek</h1>
      <p className="text-muted-brand text-sm">
        Próbka 10% notatek kontaktowych z każdego miesiąca, losowana przez job liczący wyniki
        trenerów. Cel: notatki mają być realne, nie formułki.
      </p>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Do przejrzenia ({pending.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-3">
          {pending.map((note) => (
            <li key={note.id} className="border-brand-red/30 bg-brand-red/5 rounded-md border p-3">
              <p className="text-muted-brand font-mono text-xs tracking-widest uppercase">
                {note.member.firstName} {note.member.lastName} · {note.authorUser.name} ·{" "}
                {formatDate(note.createdAt)}
              </p>
              <p className="text-text mt-1 text-sm">{note.body}</p>
              <form action={markNoteReviewedAction} className="mt-2">
                <input type="hidden" name="noteId" value={note.id} />
                <Button type="submit" size="sm" variant="outline">
                  Oznacz jako sprawdzoną
                </Button>
              </form>
            </li>
          ))}
          {pending.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak notatek do przejrzenia.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Sprawdzone (ostatnie {reviewed.length})
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {reviewed.map((note) => (
            <li key={note.id} className="border-line bg-surface rounded-md border p-3">
              <p className="text-muted-brand font-mono text-xs tracking-widest uppercase">
                {note.member.firstName} {note.member.lastName} · {note.authorUser.name} · sprawdzono{" "}
                {formatDate(note.reviewedAt!)}
              </p>
              <p className="text-text mt-1 text-sm">{note.body}</p>
            </li>
          ))}
          {reviewed.length === 0 ? (
            <li className="text-muted-brand text-sm">Brak jeszcze sprawdzonych notatek.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
