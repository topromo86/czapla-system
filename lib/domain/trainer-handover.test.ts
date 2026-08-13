import { describe, expect, it } from "vitest";
import {
  canHardDelete,
  describeDeletionBlockers,
  groupItemsByTarget,
  handoverFieldName,
  resolveHandoverTargets,
  validateHandover,
  type HandoverItem,
} from "./trainer-handover";

const items: HandoverItem[] = [
  { kind: "MEMBER", id: "m1", label: "Jan Kowalski" },
  { kind: "MEMBER", id: "m2", label: "Anna Nowak" },
  { kind: "SESSION", id: "s1", label: "Boks - grupa ogólna", detail: "pon., 20 lip, 18:00" },
  { kind: "TASK", id: "t1", label: "Brak treningu od 7 dni" },
];

describe("handoverFieldName", () => {
  it("buduje unikalną nazwę pola dla pozycji", () => {
    expect(handoverFieldName({ kind: "MEMBER", id: "m1" })).toBe("target__MEMBER__m1");
  });

  it("rozróżnia pozycje o tym samym id, ale innym rodzaju", () => {
    expect(handoverFieldName({ kind: "MEMBER", id: "x" })).not.toBe(
      handoverFieldName({ kind: "SESSION", id: "x" }),
    );
  });
});

describe("resolveHandoverTargets", () => {
  it("przypisuje wszystkim wybór zbiorczy", () => {
    const targets = resolveHandoverTargets(items, "tB", {});
    expect(targets.size).toBe(4);
    for (const item of items) expect(targets.get(item.id)).toBe("tB");
  });

  it("wybór pojedynczy nadpisuje zbiorczy", () => {
    const targets = resolveHandoverTargets(items, "tB", {
      [handoverFieldName(items[2])]: "tC",
    });
    expect(targets.get("m1")).toBe("tB");
    expect(targets.get("s1")).toBe("tC");
  });

  it("działa bez wyboru zbiorczego - same pojedyncze", () => {
    const targets = resolveHandoverTargets(items, null, {
      [handoverFieldName(items[0])]: "tB",
      [handoverFieldName(items[1])]: "tC",
    });
    expect(targets.get("m1")).toBe("tB");
    expect(targets.get("m2")).toBe("tC");
    expect(targets.has("s1")).toBe(false);
  });

  it("pusty ciąg w polu pojedynczym traktuje jako brak wyboru", () => {
    const targets = resolveHandoverTargets(items, "tB", {
      [handoverFieldName(items[0])]: "",
    });
    expect(targets.get("m1")).toBe("tB");
  });

  it("bez żadnego wyboru nie przypisuje nic", () => {
    expect(resolveHandoverTargets(items, null, {}).size).toBe(0);
  });
});

describe("validateHandover", () => {
  const base = {
    items,
    eligibleTrainerIds: ["tB", "tC"],
    trainerBeingDeactivatedId: "tA",
  };

  it("przepuszcza komplet poprawnych przypisań", () => {
    const targets = resolveHandoverTargets(items, "tB", {});
    expect(validateHandover({ ...base, targets })).toBeNull();
  });

  it("brak pozycji do przepisania to poprawny stan", () => {
    expect(validateHandover({ ...base, items: [], targets: new Map() })).toBeNull();
  });

  // Sedno: ani jedna grupa i ani jeden klient nie może zostać bez opiekuna.
  it("odrzuca niekompletne przypisanie i wskazuje brakujące pozycje", () => {
    const targets = resolveHandoverTargets(items, null, {
      [handoverFieldName(items[0])]: "tB",
    });
    const error = validateHandover({ ...base, targets });
    expect(error?.code).toBe("MISSING_TARGET");
    if (error?.code !== "MISSING_TARGET") return;
    expect(error.items.map((i) => i.id)).toEqual(["m2", "s1", "t1"]);
  });

  it("odrzuca przepisanie na wyciszanego trenera", () => {
    const targets = resolveHandoverTargets(items, "tA", {});
    const error = validateHandover({ ...base, targets });
    expect(error?.code).toBe("TARGET_IS_SELF");
  });

  it("odrzuca trenera spoza listy uprawnionych (np. też wyciszonego)", () => {
    const targets = resolveHandoverTargets(items, "tNieaktywny", {});
    const error = validateHandover({ ...base, targets });
    expect(error?.code).toBe("UNKNOWN_TARGET");
  });

  it("zgłasza brak kogokolwiek do przejęcia, gdy nie ma innych trenerów", () => {
    const error = validateHandover({
      ...base,
      eligibleTrainerIds: [],
      targets: new Map(),
    });
    expect(error?.code).toBe("NO_TRAINERS_AVAILABLE");
  });

  it("brak trenerów nie jest problemem, gdy nie ma czego przepisywać", () => {
    expect(
      validateHandover({ ...base, items: [], eligibleTrainerIds: [], targets: new Map() }),
    ).toBeNull();
  });
});

describe("groupItemsByTarget", () => {
  it("grupuje pozycje po docelowym trenerze", () => {
    const targets = resolveHandoverTargets(items, "tB", {
      [handoverFieldName(items[2])]: "tC",
    });
    const grouped = groupItemsByTarget(items, targets);
    expect(grouped.get("tB")?.map((i) => i.id)).toEqual(["m1", "m2", "t1"]);
    expect(grouped.get("tC")?.map((i) => i.id)).toEqual(["s1"]);
  });

  it("pomija pozycje bez przypisania", () => {
    const grouped = groupItemsByTarget(items, new Map([["m1", "tB"]]));
    expect(grouped.size).toBe(1);
    expect(grouped.get("tB")).toHaveLength(1);
  });
});

describe("canHardDelete", () => {
  it("pozwala usunąć trenera bez żadnej historii", () => {
    expect(canHardDelete({ sessions: 0, members: 0, templates: 0, tasks: 0 })).toBe(true);
  });

  it("blokuje usunięcie przy jakiejkolwiek historii", () => {
    expect(canHardDelete({ sessions: 1, members: 0, templates: 0, tasks: 0 })).toBe(false);
    expect(canHardDelete({ sessions: 0, members: 1, templates: 0, tasks: 0 })).toBe(false);
    expect(canHardDelete({ sessions: 0, members: 0, templates: 1, tasks: 0 })).toBe(false);
    expect(canHardDelete({ sessions: 0, members: 0, templates: 0, tasks: 1 })).toBe(false);
  });
});

describe("describeDeletionBlockers", () => {
  it("wymienia tylko niezerowe przeszkody", () => {
    expect(describeDeletionBlockers({ sessions: 3, members: 0, templates: 1, tasks: 0 })).toEqual([
      "3 zajęć w historii",
      "1 planów zajęć",
    ]);
  });

  it("pusta lista, gdy nic nie blokuje", () => {
    expect(describeDeletionBlockers({ sessions: 0, members: 0, templates: 0, tasks: 0 })).toEqual(
      [],
    );
  });
});
