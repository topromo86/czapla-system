// Numery telefonu w formacie polskim.
//
// Klub działa w Polsce i dzwoni do kadry z Polski, więc jedyny akceptowany
// kierunkowy to +48. Numer zapisujemy zawsze w jednej postaci (+48XXXXXXXXX),
// bo dopiero wtedy odnośnik `tel:` działa wszędzie tak samo, a dwa zapisy tego
// samego numeru nie wyglądają w bazie jak dwie różne osoby.

export const PHONE_PREFIX = "+48";
export const PHONE_HINT = "Numer w formacie +48 i dziewięć cyfr, np. +48 500 600 700.";

export type PhoneError = "EMPTY" | "FOREIGN_PREFIX" | "WRONG_LENGTH";

export const PHONE_ERROR_MESSAGE: Record<PhoneError, string> = {
  EMPTY: "Podaj numer telefonu.",
  FOREIGN_PREFIX: "Przyjmujemy numery polskie, z kierunkowym +48.",
  WRONG_LENGTH: "Polski numer ma dziewięć cyfr, np. +48 500 600 700.",
};

// Zwraca numer w postaci +48XXXXXXXXX albo powód odrzucenia. Przyjmuje to, co
// ludzie realnie wpisują: ze spacjami, myślnikami, w nawiasach, z zerami
// wiodącymi (0048) i bez kierunkowego.
export function parsePolishPhone(raw: string): { phone: string } | { error: PhoneError } {
  const cleaned = raw.replace(/[\s()-]/g, "");
  if (cleaned.length === 0) return { error: "EMPTY" };

  let digits = cleaned;
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+48")) return { error: "FOREIGN_PREFIX" };
    digits = digits.slice(3);
  } else if (digits.startsWith("0048")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("48") && digits.length === 11) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 10) {
    // Zapis "0 500 600 700" z czasów wybierania międzymiastowego.
    digits = digits.slice(1);
  }

  if (!/^\d+$/.test(digits)) return { error: "WRONG_LENGTH" };
  if (digits.length !== 9) return { error: "WRONG_LENGTH" };

  return { phone: `${PHONE_PREFIX}${digits}` };
}

// Do wyświetlania: +48 500 600 700. Numer w bazie zostaje bez spacji.
export function formatPolishPhone(phone: string): string {
  const digits = phone.startsWith(PHONE_PREFIX) ? phone.slice(3) : phone;
  if (digits.length !== 9) return phone;
  return `${PHONE_PREFIX} ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
