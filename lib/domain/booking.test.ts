import { describe, expect, it } from "vitest";
import {
  calculateAge,
  canCancelFree,
  evaluateBookingEligibility,
  hasFreeSpot,
  hasRequiredConsents,
  isAgeEligible,
  isPassUsable,
  isWithinCheckInWindow,
  nextWaitlistPosition,
  nextWaitlistPromotion,
  requiredConsentKeys,
  resolveCancellationOutcome,
  type PassLike,
  type SessionLike,
} from "./booking";

const HOUR = 3_600_000;
const MIN = 60_000;

describe("canCancelFree", () => {
  it("true dokładnie na granicy 4h", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const startsAt = new Date(now.getTime() + 4 * HOUR);
    expect(canCancelFree(startsAt, now)).toBe(true);
  });

  it("false tuż poniżej granicy 4h", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const startsAt = new Date(now.getTime() + 4 * HOUR - MIN);
    expect(canCancelFree(startsAt, now)).toBe(false);
  });

  it("true z dużym zapasem", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const startsAt = new Date(now.getTime() + 48 * HOUR);
    expect(canCancelFree(startsAt, now)).toBe(true);
  });
});

describe("resolveCancellationOutcome", () => {
  it("CANCELLED gdy >= 4h przed startem", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const startsAt = new Date(now.getTime() + 5 * HOUR);
    expect(resolveCancellationOutcome(startsAt, now)).toBe("CANCELLED");
  });

  it("NO_SHOW gdy < 4h przed startem", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const startsAt = new Date(now.getTime() + HOUR);
    expect(resolveCancellationOutcome(startsAt, now)).toBe("NO_SHOW");
  });
});

describe("isWithinCheckInWindow", () => {
  const startsAt = new Date("2026-01-01T18:00:00Z");

  it("true dokładnie -30 min", () => {
    expect(isWithinCheckInWindow(startsAt, new Date(startsAt.getTime() - 30 * MIN))).toBe(true);
  });

  it("false na -31 min", () => {
    expect(isWithinCheckInWindow(startsAt, new Date(startsAt.getTime() - 31 * MIN))).toBe(false);
  });

  it("true dokładnie +20 min", () => {
    expect(isWithinCheckInWindow(startsAt, new Date(startsAt.getTime() + 20 * MIN))).toBe(true);
  });

  it("false na +21 min", () => {
    expect(isWithinCheckInWindow(startsAt, new Date(startsAt.getTime() + 21 * MIN))).toBe(false);
  });

  it("true dokładnie w momencie startu", () => {
    expect(isWithinCheckInWindow(startsAt, startsAt)).toBe(true);
  });
});

describe("calculateAge", () => {
  it("liczy pełne lata gdy urodziny już były w tym roku", () => {
    const birthDate = new Date("2010-03-01T00:00:00Z");
    const ref = new Date("2026-06-15T00:00:00Z");
    expect(calculateAge(birthDate, ref)).toBe(16);
  });

  it("nie liczy roku, jeśli urodziny jeszcze nie minęły", () => {
    const birthDate = new Date("2010-12-01T00:00:00Z");
    const ref = new Date("2026-06-15T00:00:00Z");
    expect(calculateAge(birthDate, ref)).toBe(15);
  });

  it("liczy dokładnie w dniu urodzin", () => {
    const birthDate = new Date("2010-06-15T00:00:00Z");
    const ref = new Date("2026-06-15T00:00:00Z");
    expect(calculateAge(birthDate, ref)).toBe(16);
  });

  it("dzień przed urodzinami to jeszcze poprzedni wiek", () => {
    const birthDate = new Date("2010-06-15T00:00:00Z");
    const ref = new Date("2026-06-14T00:00:00Z");
    expect(calculateAge(birthDate, ref)).toBe(15);
  });
});

describe("isAgeEligible", () => {
  const ref = new Date("2026-06-15T00:00:00Z");

  it("brak limitów - zawsze true", () => {
    expect(isAgeEligible(new Date("2000-01-01"), ref, null, null)).toBe(true);
  });

  it("false poniżej minAge", () => {
    expect(isAgeEligible(new Date("2020-01-01"), ref, 10, null)).toBe(false);
  });

  it("true dokładnie na minAge", () => {
    expect(isAgeEligible(new Date("2016-06-15"), ref, 10, null)).toBe(true);
  });

  it("false powyżej maxAge", () => {
    expect(isAgeEligible(new Date("2000-01-01"), ref, null, 15)).toBe(false);
  });

  it("true dokładnie na maxAge", () => {
    expect(isAgeEligible(new Date("2011-06-15"), ref, null, 15)).toBe(true);
  });
});

describe("requiredConsentKeys / hasRequiredConsents", () => {
  it("dorosły nie wymaga zgody opiekuna", () => {
    expect(requiredConsentKeys(false)).toEqual(["reg", "rodo", "health"]);
  });

  it("nieletni wymaga zgody opiekuna", () => {
    expect(requiredConsentKeys(true)).toEqual(["reg", "rodo", "health", "guardian"]);
  });

  it("true gdy wszystkie wymagane klucze obecne", () => {
    const granted = new Set(["reg", "rodo", "health"]);
    expect(hasRequiredConsents(granted, requiredConsentKeys(false))).toBe(true);
  });

  it("false gdy brakuje jednej zgody", () => {
    const granted = new Set(["reg", "rodo"]);
    expect(hasRequiredConsents(granted, requiredConsentKeys(false))).toBe(false);
  });

  it("false dla nieletniego bez zgody opiekuna mimo reszty kompletu", () => {
    const granted = new Set(["reg", "rodo", "health"]);
    expect(hasRequiredConsents(granted, requiredConsentKeys(true))).toBe(false);
  });
});

describe("isPassUsable", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const base: PassLike = { status: "ACTIVE", endsAt: new Date("2026-07-01"), entriesLeft: null };

  it("true dla aktywnego karnetu OPEN", () => {
    expect(isPassUsable(base, now)).toBe(true);
  });

  it("false dla statusu innego niż ACTIVE", () => {
    expect(isPassUsable({ ...base, status: "FROZEN" }, now)).toBe(false);
    expect(isPassUsable({ ...base, status: "EXPIRED" }, now)).toBe(false);
    expect(isPassUsable({ ...base, status: "CANCELLED" }, now)).toBe(false);
  });

  it("false gdy endsAt minęło", () => {
    expect(isPassUsable({ ...base, endsAt: new Date("2026-06-01") }, now)).toBe(false);
  });

  it("false gdy limitowany karnet ma 0 wejść", () => {
    expect(isPassUsable({ ...base, entriesLeft: 0 }, now)).toBe(false);
  });

  it("true gdy limitowany karnet ma > 0 wejść", () => {
    expect(isPassUsable({ ...base, entriesLeft: 3 }, now)).toBe(true);
  });
});

describe("hasFreeSpot", () => {
  it("true poniżej capacity", () => {
    expect(hasFreeSpot(5, 10)).toBe(true);
  });

  it("false dokładnie na capacity", () => {
    expect(hasFreeSpot(10, 10)).toBe(false);
  });

  it("false powyżej capacity", () => {
    expect(hasFreeSpot(11, 10)).toBe(false);
  });
});

describe("evaluateBookingEligibility", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const activePass: PassLike = {
    status: "ACTIVE",
    endsAt: new Date("2026-07-01"),
    entriesLeft: null,
  };
  const session: SessionLike = {
    startsAt: new Date("2026-06-16T18:00:00Z"),
    capacity: 16,
    status: "SCHEDULED",
  };
  const allConsents = new Set(["reg", "rodo", "health"]);

  const baseInput = {
    now,
    memberBirthDate: new Date("1990-01-01"),
    memberIsMinor: false,
    grantedConsentKeys: allConsents,
    activePass,
    session,
    bookedCount: 5,
  };

  it("ok, bez listy rezerwowej gdy jest miejsce", () => {
    const result = evaluateBookingEligibility(baseInput);
    expect(result).toEqual({ ok: true, willWaitlist: false });
  });

  it("ok z listą rezerwową gdy komplet", () => {
    const result = evaluateBookingEligibility({ ...baseInput, bookedCount: 16 });
    expect(result).toEqual({ ok: true, willWaitlist: true });
  });

  it("odrzuca odwołane zajęcia", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      session: { ...session, status: "CANCELLED" },
    });
    expect(result).toEqual({ ok: false, reason: "SESSION_CANCELLED" });
  });

  it("odrzuca zajęcia, które już się zaczęły", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      session: { ...session, startsAt: new Date(now.getTime() - MIN) },
    });
    expect(result).toEqual({ ok: false, reason: "ALREADY_STARTED" });
  });

  it("odrzuca przy braku kompletu zgód", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      grantedConsentKeys: new Set(["reg"]),
    });
    expect(result).toEqual({ ok: false, reason: "MISSING_CONSENTS" });
  });

  it("odrzuca przy braku aktywnego karnetu", () => {
    const result = evaluateBookingEligibility({ ...baseInput, activePass: null });
    expect(result).toEqual({ ok: false, reason: "NO_ACTIVE_PASS" });
  });

  it("odrzuca przy wygasłym karnecie", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      activePass: { ...activePass, endsAt: new Date("2026-01-01") },
    });
    expect(result).toEqual({ ok: false, reason: "NO_ACTIVE_PASS" });
  });

  it("odrzuca dziecko poza zakresem wieku grupy", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      memberBirthDate: new Date("2022-01-01"), // 4 lata w dniu zajęć, poniżej minAge
      session: { ...session, minAge: 6, maxAge: 12 },
    });
    expect(result).toEqual({ ok: false, reason: "AGE_NOT_ELIGIBLE" });
  });

  it("zgody sprawdzane przed karnetem (kolejność ważna dla komunikatu)", () => {
    const result = evaluateBookingEligibility({
      ...baseInput,
      grantedConsentKeys: new Set(),
      activePass: null,
    });
    expect(result).toEqual({ ok: false, reason: "MISSING_CONSENTS" });
  });
});

describe("nextWaitlistPromotion", () => {
  it("null dla pustej listy", () => {
    expect(nextWaitlistPromotion([])).toBeNull();
  });

  it("wybiera najniższą pozycję", () => {
    const list = [
      { id: "a", waitlistPosition: 3 },
      { id: "b", waitlistPosition: 1 },
      { id: "c", waitlistPosition: 2 },
    ];
    expect(nextWaitlistPromotion(list)?.id).toBe("b");
  });

  it("ignoruje wpisy bez pozycji", () => {
    const list = [
      { id: "a", waitlistPosition: null },
      { id: "b", waitlistPosition: 5 },
    ];
    expect(nextWaitlistPromotion(list)?.id).toBe("b");
  });
});

describe("nextWaitlistPosition", () => {
  it("1 dla pustej listy", () => {
    expect(nextWaitlistPosition([])).toBe(1);
  });

  it("max + 1 dla niepustej listy", () => {
    expect(nextWaitlistPosition([{ waitlistPosition: 2 }, { waitlistPosition: 5 }])).toBe(6);
  });

  it("ignoruje null przy liczeniu maksimum", () => {
    expect(nextWaitlistPosition([{ waitlistPosition: null }, { waitlistPosition: 3 }])).toBe(4);
  });
});
