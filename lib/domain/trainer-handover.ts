// Czyste funkcje przekazania obowiązków przy wyciszaniu trenera.
//
// Reguła nadrzędna: wyciszenie trenera NIE MOŻE zostawić niczego bez
// opiekuna. Każdy klient, każde przyszłe zajęcia, każdy powtarzalny plan i
// każde otwarte zadanie retencyjne muszą dostać nowego trenera - inaczej
// grupa przychodzi na salę, na której nikt nie czeka. Dlatego walidacja jest
// kompletna (validateHandover), a nie "na ile się da".

export type HandoverItemKind = "MEMBER" | "SESSION" | "TEMPLATE" | "TASK";

export type HandoverItem = {
  kind: HandoverItemKind;
  id: string;
  label: string;
  // Podpowiedź dla właściciela - np. data zajęć albo lokalizacja.
  detail?: string;
};

export const HANDOVER_KIND_LABEL: Record<HandoverItemKind, string> = {
  MEMBER: "Podopieczni",
  SESSION: "Zaplanowane zajęcia",
  TEMPLATE: "Powtarzalny plan zajęć",
  TASK: "Otwarte zadania retencyjne",
};

// Klucz pola formularza dla pojedynczej pozycji - jedno miejsce definicji,
// żeby strona i akcja serwerowa nie rozjechały się na literówce.
export function handoverFieldName(item: Pick<HandoverItem, "kind" | "id">): string {
  return `target__${item.kind}__${item.id}`;
}

export type HandoverTargets = Map<string, string>;

// Scala wybór zbiorczy ("przepisz wszystkich na X") z wyborami pojedynczymi.
// Wybór pojedynczy zawsze wygrywa - właściciel mógł ustawić hurt, a potem
// poprawić dwie pozycje i to jest poprawka, nie przypadek.
export function resolveHandoverTargets(
  items: readonly HandoverItem[],
  bulkTargetId: string | null,
  perItem: Readonly<Record<string, string | null | undefined>>,
): HandoverTargets {
  const targets: HandoverTargets = new Map();
  for (const item of items) {
    const own = perItem[handoverFieldName(item)];
    const chosen = own && own.length > 0 ? own : (bulkTargetId ?? null);
    if (chosen) targets.set(item.id, chosen);
  }
  return targets;
}

export type HandoverValidationError =
  | { code: "NO_TRAINERS_AVAILABLE" }
  | { code: "MISSING_TARGET"; items: HandoverItem[] }
  | { code: "TARGET_IS_SELF"; items: HandoverItem[] }
  | { code: "UNKNOWN_TARGET"; items: HandoverItem[] };

export function validateHandover(input: {
  items: readonly HandoverItem[];
  targets: HandoverTargets;
  // Trenerzy, na których wolno przepisać: aktywni, bez wyciszanego.
  eligibleTrainerIds: readonly string[];
  trainerBeingDeactivatedId: string;
}): HandoverValidationError | null {
  if (input.items.length === 0) return null;
  if (input.eligibleTrainerIds.length === 0) return { code: "NO_TRAINERS_AVAILABLE" };

  const eligible = new Set(input.eligibleTrainerIds);

  const missing: HandoverItem[] = [];
  const self: HandoverItem[] = [];
  const unknown: HandoverItem[] = [];

  for (const item of input.items) {
    const target = input.targets.get(item.id);
    if (!target) {
      missing.push(item);
      continue;
    }
    if (target === input.trainerBeingDeactivatedId) {
      self.push(item);
      continue;
    }
    if (!eligible.has(target)) unknown.push(item);
  }

  if (missing.length > 0) return { code: "MISSING_TARGET", items: missing };
  if (self.length > 0) return { code: "TARGET_IS_SELF", items: self };
  if (unknown.length > 0) return { code: "UNKNOWN_TARGET", items: unknown };
  return null;
}

// Grupuje pozycje po docelowym trenerze - do podsumowania "co komu poszło"
// w logu aktywności i w komunikacie dla właściciela.
export function groupItemsByTarget(
  items: readonly HandoverItem[],
  targets: HandoverTargets,
): Map<string, HandoverItem[]> {
  const grouped = new Map<string, HandoverItem[]>();
  for (const item of items) {
    const target = targets.get(item.id);
    if (!target) continue;
    const bucket = grouped.get(target);
    if (bucket) bucket.push(item);
    else grouped.set(target, [item]);
  }
  return grouped;
}

export type DeletionBlocker = {
  sessions: number;
  members: number;
  templates: number;
  tasks: number;
};

// Twarde usunięcie trenera wolno tylko wtedy, gdy nie ciągnie za sobą żadnej
// historii - czyli w praktyce przy rekordzie założonym przez pomyłkę. Sesje,
// klienci i zadania mają w bazie onDelete: Restrict, bo to historia klubu
// (obecności, oceny, rozliczenia) i nie wolno jej kasować kaskadowo.
export function canHardDelete(blockers: DeletionBlocker): boolean {
  return (
    blockers.sessions === 0 &&
    blockers.members === 0 &&
    blockers.templates === 0 &&
    blockers.tasks === 0
  );
}

export function describeDeletionBlockers(blockers: DeletionBlocker): string[] {
  const parts: string[] = [];
  if (blockers.sessions > 0) parts.push(`${blockers.sessions} zajęć w historii`);
  if (blockers.members > 0) parts.push(`${blockers.members} podopiecznych`);
  if (blockers.templates > 0) parts.push(`${blockers.templates} planów zajęć`);
  if (blockers.tasks > 0) parts.push(`${blockers.tasks} zadań retencyjnych`);
  return parts;
}
