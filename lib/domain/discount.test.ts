import { describe, expect, it } from "vitest";
import {
  applyGiftCard,
  discountAmount,
  discountedPrice,
  normalizeCode,
  validateGiftCard,
  validatePromoCode,
  validatePromoValue,
  type PromoLike,
} from "./discount";

describe("normalizeCode", () => {
  it("ujednolica wielkość liter i usuwa spacje", () => {
    expect(normalizeCode("  lato 2026 ")).toBe("LATO2026");
    expect(normalizeCode("Start10")).toBe("START10");
  });
});

describe("discountedPrice", () => {
  it("procent zdejmuje właściwą kwotę (grosze, zaokrąglenie)", () => {
    expect(discountAmount(20000, "PERCENT", 10)).toBe(2000);
    expect(discountedPrice(20000, "PERCENT", 10)).toBe(18000);
    // 15% z 19999 = 2999.85 -> 3000
    expect(discountAmount(19999, "PERCENT", 15)).toBe(3000);
  });

  it("kwota zdejmuje wprost, ale nie poniżej zera", () => {
    expect(discountedPrice(20000, "AMOUNT", 5000)).toBe(15000);
    expect(discountedPrice(3000, "AMOUNT", 5000)).toBe(0);
  });

  it("100% daje zero, 0 ceny zostaje zerem", () => {
    expect(discountedPrice(20000, "PERCENT", 100)).toBe(0);
    expect(discountedPrice(0, "AMOUNT", 1000)).toBe(0);
  });

  it("procent poza zakresem jest przycinany", () => {
    expect(discountAmount(10000, "PERCENT", 150)).toBe(10000);
    expect(discountAmount(10000, "PERCENT", -5)).toBe(0);
  });
});

describe("validatePromoValue", () => {
  it("procent musi być 1-100", () => {
    expect(validatePromoValue("PERCENT", 0)).not.toBeNull();
    expect(validatePromoValue("PERCENT", 101)).not.toBeNull();
    expect(validatePromoValue("PERCENT", 50)).toBeNull();
  });
  it("kwota musi być dodatnia i całkowita", () => {
    expect(validatePromoValue("AMOUNT", 0)).not.toBeNull();
    expect(validatePromoValue("AMOUNT", 1000)).toBeNull();
    expect(validatePromoValue("AMOUNT", 12.5)).not.toBeNull();
  });
});

describe("validatePromoCode", () => {
  const base: PromoLike = {
    active: true,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    usedCount: 0,
    planId: null,
  };
  const now = new Date("2026-07-31T10:00:00Z");

  it("aktywny bez ograniczeń przechodzi", () => {
    expect(validatePromoCode(base, { planId: "p1", now })).toBeNull();
  });

  it("nieaktywny odpada", () => {
    expect(validatePromoCode({ ...base, active: false }, { planId: "p1", now })).toBe("INACTIVE");
  });

  it("przed startem i po terminie odpada", () => {
    expect(
      validatePromoCode(
        { ...base, validFrom: new Date("2026-08-01T00:00:00Z") },
        { planId: "p1", now },
      ),
    ).toBe("NOT_STARTED");
    expect(
      validatePromoCode(
        { ...base, validUntil: new Date("2026-07-30T00:00:00Z") },
        { planId: "p1", now },
      ),
    ).toBe("EXPIRED");
  });

  it("wyczerpany limit odpada", () => {
    expect(validatePromoCode({ ...base, maxUses: 5, usedCount: 5 }, { planId: "p1", now })).toBe(
      "USED_UP",
    );
    expect(
      validatePromoCode({ ...base, maxUses: 5, usedCount: 4 }, { planId: "p1", now }),
    ).toBeNull();
  });

  it("kod przypisany do innego planu odpada, do tego samego przechodzi", () => {
    expect(validatePromoCode({ ...base, planId: "p2" }, { planId: "p1", now })).toBe("WRONG_PLAN");
    expect(validatePromoCode({ ...base, planId: "p1" }, { planId: "p1", now })).toBeNull();
  });
});

describe("karta podarunkowa", () => {
  const now = new Date("2026-07-31T10:00:00Z");

  it("waliduje aktywność, termin i saldo", () => {
    expect(
      validateGiftCard({ active: true, validUntil: null, balanceGross: 10000 }, now),
    ).toBeNull();
    expect(validateGiftCard({ active: false, validUntil: null, balanceGross: 10000 }, now)).toBe(
      "INACTIVE",
    );
    expect(
      validateGiftCard(
        { active: true, validUntil: new Date("2026-07-01T00:00:00Z"), balanceGross: 10000 },
        now,
      ),
    ).toBe("EXPIRED");
    expect(validateGiftCard({ active: true, validUntil: null, balanceGross: 0 }, now)).toBe(
      "NO_BALANCE",
    );
  });

  it("pokrywa część należności, resztę do dopłaty", () => {
    expect(applyGiftCard(20000, 5000)).toEqual({ applied: 5000, remaining: 15000, balanceLeft: 0 });
  });

  it("nadwyżka salda zostaje na karcie", () => {
    expect(applyGiftCard(8000, 20000)).toEqual({ applied: 8000, remaining: 0, balanceLeft: 12000 });
  });

  it("dokładne pokrycie zeruje i saldo, i należność", () => {
    expect(applyGiftCard(10000, 10000)).toEqual({ applied: 10000, remaining: 0, balanceLeft: 0 });
  });
});
