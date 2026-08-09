// Status rozliczenia karnetu: ile uzgodniono, ile wpłacono, ile zostało.
//
// Klub przyjmuje wpłaty częściowe - ktoś płaci połowę przy zapisie, resztę za
// tydzień. Dlatego karnet pamięta uzgodnioną cenę (Pass.priceGross), a wpłaty
// są osobnymi wpisami (Payment). Dopiero zestawienie obu daje odpowiedź na
// pytanie "czy ten człowiek ma opłacone".
//
// Świadome założenie: karnet z niedopłatą DZIAŁA. W klubie ludzie trenują i
// dopłacają później - blokowanie wejścia za 20 zł zaległości byłoby gorsze niż
// pokazanie tego trenerowi na ekranie. Zaległość jest widoczna, nie blokująca.

export type SettlementStatus = "PAID" | "PARTIAL" | "UNPAID" | "OVERPAID";

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  PAID: "Opłacony",
  PARTIAL: "Do dopłaty",
  UNPAID: "Nieopłacony",
  OVERPAID: "Nadpłata",
};

export type Settlement = {
  status: SettlementStatus;
  priceGross: number;
  paidGross: number;
  /** Ile zostało do zapłaty (0, gdy opłacony lub nadpłacony). */
  outstandingGross: number;
  /** Ile klient nadpłacił (0, gdy nie ma nadpłaty). */
  overpaidGross: number;
};

export function settlePass(priceGross: number, paidGross: number): Settlement {
  const price = Math.max(0, Math.round(priceGross));
  const paid = Math.round(paidGross);

  const outstandingGross = Math.max(0, price - paid);
  const overpaidGross = Math.max(0, paid - price);

  let status: SettlementStatus;
  if (overpaidGross > 0) status = "OVERPAID";
  else if (outstandingGross === 0) status = "PAID";
  else if (paid <= 0) status = "UNPAID";
  else status = "PARTIAL";

  return { status, priceGross: price, paidGross: paid, outstandingGross, overpaidGross };
}

// Suma wpłat przypisanych do karnetu. Korekty (zwroty) mają ujemną kwotę i
// zapisane są jako osobne wpisy, więc zwykłe sumowanie daje właściwy wynik -
// zwrot obniża sumę wpłat, tak jak powinien.
export function sumPayments(payments: readonly { amountGross: number }[]): number {
  return payments.reduce((sum, p) => sum + p.amountGross, 0);
}

// Ile wolno jeszcze przyjąć na ten karnet. Nadpłatę dopuszczamy świadomie
// (klient płaci z góry za przedłużenie), ale ekran ma czym ostrzec.
export function validatePaymentAmount(amountGross: number): string | null {
  if (!Number.isInteger(amountGross)) return "Kwota musi być liczbą.";
  if (amountGross === 0) return "Podaj kwotę różną od zera.";
  if (amountGross < 0) return "Kwota nie może być ujemna - zwrot zrób korektą w Finansach.";
  return null;
}
