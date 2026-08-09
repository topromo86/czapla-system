import { describe, expect, it } from "vitest";
import { settlePass, sumPayments, validatePaymentAmount } from "./payment-status";

describe("settlePass", () => {
  it("pełna wpłata = opłacony, zero do dopłaty", () => {
    const s = settlePass(24900, 24900);
    expect(s.status).toBe("PAID");
    expect(s.outstandingGross).toBe(0);
    expect(s.overpaidGross).toBe(0);
  });

  // Sedno funkcji: klub przyjmuje wpłaty częściowe.
  it("część kwoty = do dopłaty z konkretną resztą", () => {
    const s = settlePass(24900, 10000);
    expect(s.status).toBe("PARTIAL");
    expect(s.outstandingGross).toBe(14900);
  });

  it("brak wpłat = nieopłacony", () => {
    const s = settlePass(24900, 0);
    expect(s.status).toBe("UNPAID");
    expect(s.outstandingGross).toBe(24900);
  });

  it("wpłata ponad cenę = nadpłata", () => {
    const s = settlePass(24900, 30000);
    expect(s.status).toBe("OVERPAID");
    expect(s.overpaidGross).toBe(5100);
    expect(s.outstandingGross).toBe(0);
  });

  // Karnet gratisowy (rabat 100%) nie może wisieć jako nieopłacony.
  it("cena zero bez wpłat jest opłacona", () => {
    expect(settlePass(0, 0).status).toBe("PAID");
  });

  // Zwrot większy niż wpłaty daje saldo ujemne - traktujemy jak brak zapłaty,
  // a nie jako nadpłatę.
  it("saldo ujemne po zwrocie = nieopłacony", () => {
    const s = settlePass(24900, -500);
    expect(s.status).toBe("UNPAID");
    expect(s.outstandingGross).toBe(25400);
  });
});

describe("sumPayments", () => {
  it("sumuje wpłaty", () => {
    expect(sumPayments([{ amountGross: 10000 }, { amountGross: 14900 }])).toBe(24900);
  });

  // Korekta zwrotu ma kwotę ujemną - ma obniżać sumę, nie podnosić.
  it("zwrot obniża sumę", () => {
    expect(sumPayments([{ amountGross: 24900 }, { amountGross: -4900 }])).toBe(20000);
  });

  it("brak wpłat to zero", () => {
    expect(sumPayments([])).toBe(0);
  });
});

describe("validatePaymentAmount", () => {
  it("przepuszcza kwotę dodatnią", () => {
    expect(validatePaymentAmount(10000)).toBeNull();
  });

  it("odrzuca zero i kwoty ujemne", () => {
    expect(validatePaymentAmount(0)).not.toBeNull();
    expect(validatePaymentAmount(-100)).not.toBeNull();
  });

  it("odrzuca grosze ułamkowe", () => {
    expect(validatePaymentAmount(100.5)).not.toBeNull();
  });
});
