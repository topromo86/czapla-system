import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { closeRetentionTaskAction } from "../podopieczni/actions";

const TASK_LABEL: Record<string, string> = {
  INACTIVE_7: "Brak treningu od 7 dni",
  INACTIVE_14: "Brak treningu od 14 dni",
  RENEWAL: "Kończy się karnet",
};

export default async function AlertyPage() {
  const { trainer } = await requireTrainerSelf();

  const tasks = await prisma.retentionTask.findMany({
    where: { trainerId: trainer.id, closedAt: null },
    include: { member: true },
    orderBy: [{ escalatedAt: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-brand-red text-2xl tracking-wide">
        Alerty ({tasks.length})
      </h1>
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`rounded-md border p-3 ${
              task.escalatedAt ? "border-red bg-red/5" : "border-line bg-surface"
            }`}
          >
            <Link
              href={`/trainer/podopieczni/${task.memberId}`}
              className="text-text hover:text-brand-red font-medium"
            >
              {task.member.firstName} {task.member.lastName}
            </Link>
            <p className="text-muted-brand font-mono text-xs">
              {TASK_LABEL[task.type] ?? task.type} · zgłoszono {formatDate(task.createdAt)}
              {task.escalatedAt ? (
                <span className="text-red"> · eskalowane do właściciela</span>
              ) : null}
            </p>
            <form action={closeRetentionTaskAction} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="retentionTaskId" value={task.id} />
              <input type="hidden" name="memberId" value={task.memberId} />
              <input type="hidden" name="returnTo" value="/trainer/alerty" />
              <Textarea
                name="body"
                placeholder="Notatka z kontaktu (min. 30 znaków) - wymagana do zamknięcia"
                required
                minLength={30}
                className="border-line bg-surface-2"
              />
              <Button type="submit" size="sm" className="self-start">
                Zamknij zadanie
              </Button>
            </form>
          </li>
        ))}
        {tasks.length === 0 ? (
          <li className="text-muted-brand text-sm">Brak otwartych zadań.</li>
        ) : null}
      </ul>
    </div>
  );
}
