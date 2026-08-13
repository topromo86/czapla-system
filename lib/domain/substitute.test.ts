import { describe, expect, it } from "vitest";
import {
  awaitsResponseFrom,
  canDecline,
  effectiveTrainerId,
  runsSessionWhere,
  seesSessionWhere,
  validateAssignment,
} from "./substitute";

const NOW = new Date("2026-07-20T08:00:00Z");
const LATER = new Date("2026-07-21T16:00:00Z");

describe("effectiveTrainerId", () => {
  it("bez zastępstwa prowadzi trener pierwotny", () => {
    expect(
      effectiveTrainerId({ trainerId: "t1", substituteTrainerId: null, substituteStatus: null }),
    ).toBe("t1");
  });

  // Sedno całej funkcji: niepotwierdzone zastępstwo nie przenosi
  // odpowiedzialności ani wynagrodzenia.
  it("niepotwierdzone zastępstwo NIE przenosi prowadzenia", () => {
    expect(
      effectiveTrainerId({
        trainerId: "t1",
        substituteTrainerId: "t2",
        substituteStatus: "PENDING",
      }),
    ).toBe("t1");
  });

  it("odrzucone zastępstwo zostawia trenera pierwotnego", () => {
    expect(
      effectiveTrainerId({
        trainerId: "t1",
        substituteTrainerId: "t2",
        substituteStatus: "DECLINED",
      }),
    ).toBe("t1");
  });

  it("potwierdzone zastępstwo przenosi prowadzenie", () => {
    expect(
      effectiveTrainerId({
        trainerId: "t1",
        substituteTrainerId: "t2",
        substituteStatus: "ACCEPTED",
      }),
    ).toBe("t2");
  });
});

describe("runsSessionWhere", () => {
  it("łapie trenera pierwotnego bez potwierdzonego zastępstwa", () => {
    expect(runsSessionWhere("t1")).toEqual({
      OR: [
        { trainerId: "t1", NOT: { substituteStatus: "ACCEPTED" } },
        { substituteTrainerId: "t1", substituteStatus: "ACCEPTED" },
      ],
    });
  });
});

describe("seesSessionWhere", () => {
  // Zastępca musi zobaczyć zajęcia zanim je potwierdzi - inaczej nie miałby
  // gdzie kliknąć.
  it("obejmuje niepotwierdzone zaproszenie", () => {
    expect(seesSessionWhere("t2")).toEqual({
      OR: [
        { trainerId: "t2" },
        { substituteTrainerId: "t2", substituteStatus: { in: ["PENDING", "ACCEPTED"] } },
      ],
    });
  });
});

describe("awaitsResponseFrom", () => {
  const pending = {
    substituteTrainerId: "t2",
    substituteStatus: "PENDING" as const,
    substituteByAdmin: false,
  };

  it("true dla wskazanego zastępcy", () => {
    expect(awaitsResponseFrom(pending, "t2")).toBe(true);
  });

  it("false dla kogoś innego", () => {
    expect(awaitsResponseFrom(pending, "t3")).toBe(false);
  });

  it("false gdy już potwierdzone", () => {
    expect(awaitsResponseFrom({ ...pending, substituteStatus: "ACCEPTED" }, "t2")).toBe(false);
  });
});

describe("canDecline", () => {
  it("prośbę od trenera można odrzucić", () => {
    expect(
      canDecline({
        substituteTrainerId: "t2",
        substituteStatus: "PENDING",
        substituteByAdmin: false,
      }),
    ).toBe(true);
  });

  // Polecenia admina się nie odrzuca - przyjmuje się je do wiadomości.
  it("polecenia admina nie można odrzucić", () => {
    expect(
      canDecline({
        substituteTrainerId: "t2",
        substituteStatus: "PENDING",
        substituteByAdmin: true,
      }),
    ).toBe(false);
  });

  it("po odpowiedzi nie ma czego odrzucać", () => {
    expect(
      canDecline({
        substituteTrainerId: "t2",
        substituteStatus: "ACCEPTED",
        substituteByAdmin: false,
      }),
    ).toBe(false);
  });
});

describe("validateAssignment", () => {
  const base = {
    trainerId: "t1",
    candidateId: "t2",
    status: null,
    sessionStatus: "SCHEDULED",
    startsAt: LATER,
    now: NOW,
    byAdmin: false,
  };

  it("przepuszcza poprawne wyznaczenie", () => {
    expect(validateAssignment(base)).toEqual({ ok: true });
  });

  it("odrzuca wyznaczenie samego siebie", () => {
    expect(validateAssignment({ ...base, candidateId: "t1" })).toEqual({
      ok: false,
      error: "SAME_TRAINER",
    });
  });

  it("odrzuca odwołane zajęcia", () => {
    expect(validateAssignment({ ...base, sessionStatus: "CANCELLED" })).toEqual({
      ok: false,
      error: "SESSION_CANCELLED",
    });
  });

  it("odrzuca zajęcia, które już się zaczęły", () => {
    expect(validateAssignment({ ...base, startsAt: new Date("2026-07-20T07:00:00Z") })).toEqual({
      ok: false,
      error: "SESSION_STARTED",
    });
  });

  it("trener nie przestawia potwierdzonego zastępstwa", () => {
    expect(validateAssignment({ ...base, status: "ACCEPTED" })).toEqual({
      ok: false,
      error: "ALREADY_ACCEPTED",
    });
  });

  it("admin przestawia potwierdzone zastępstwo", () => {
    expect(validateAssignment({ ...base, status: "ACCEPTED", byAdmin: true })).toEqual({
      ok: true,
    });
  });
});
