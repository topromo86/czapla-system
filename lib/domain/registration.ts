// Czyste funkcje rejestracji i haseł - bez dostępu do bazy, w pełni testowalne.

import { calculateAge } from "@/lib/domain/booking";

export const PASSWORD_MIN_LENGTH = 8;

// Wiek graniczny samodzielnej rejestracji. Osoby niepełnoletnie zakłada klub
// albo opiekun (rola GUARDIAN) - samodzielne konto małoletniego byłoby bez
// nadzoru opiekuna, którego wymaga cała ścieżka "moje dziecko".
export const SELF_REGISTER_MIN_AGE = 18;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Świadomie luźna walidacja: pełna zgodność z RFC nie odsiewa realnych błędów
// lepiej niż "jest małpa i kropka po niej", a odrzuca poprawne adresy.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type PasswordError = "TOO_SHORT" | "NO_LETTER" | "NO_DIGIT";

// Minimum, które ma sens dla konta klubowicza: długość plus litera i cyfra.
// Nie wymuszamy znaków specjalnych - to zniechęca bardziej, niż pomaga, a
// klient i tak nie trzyma tu niczego wrażliwego poza własnym grafikiem.
export function validatePassword(password: string): PasswordError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (!/[a-zA-Z]/.test(password)) return "NO_LETTER";
  if (!/[0-9]/.test(password)) return "NO_DIGIT";
  return null;
}

export const PASSWORD_ERROR_MESSAGE: Record<PasswordError, string> = {
  TOO_SHORT: `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
  NO_LETTER: "Hasło musi zawierać co najmniej jedną literę.",
  NO_DIGIT: "Hasło musi zawierać co najmniej jedną cyfrę.",
};

export type RegistrationError =
  | "MISSING_FIELDS"
  | "INVALID_EMAIL"
  | "INVALID_BIRTHDATE"
  | "TOO_YOUNG"
  | "PASSWORD_MISMATCH"
  | { password: PasswordError };

export type RegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  birthDate: Date;
  sex: string;
  homeLocationId: string;
  ownerTrainerId: string;
};

// Walidacja formularza rejestracji. Osobno od bazy (unikalność e-maila
// sprawdza akcja), żeby dało się przetestować bez Postgresa.
export function validateRegistration(
  input: RegistrationInput,
  now: Date,
): RegistrationError | null {
  if (
    !input.firstName ||
    !input.lastName ||
    !input.email ||
    !input.homeLocationId ||
    !input.ownerTrainerId
  ) {
    return "MISSING_FIELDS";
  }
  if (input.sex !== "MALE" && input.sex !== "FEMALE") return "MISSING_FIELDS";
  if (!isValidEmail(input.email)) return "INVALID_EMAIL";

  if (Number.isNaN(input.birthDate.getTime()) || input.birthDate > now) {
    return "INVALID_BIRTHDATE";
  }
  if (calculateAge(input.birthDate, now) < SELF_REGISTER_MIN_AGE) return "TOO_YOUNG";

  const passwordError = validatePassword(input.password);
  if (passwordError) return { password: passwordError };

  // Sprawdzamy zgodność dopiero po walidacji siły - inaczej "hasła się nie
  // zgadzają" przy dwóch identycznych, ale za krótkich hasłach myliłoby.
  if (input.password !== input.confirmPassword) return "PASSWORD_MISMATCH";

  return null;
}

export type ProfileError = "MISSING_FIELDS" | "INVALID_BIRTHDATE" | "TOO_YOUNG";

export type ProfileInput = {
  firstName: string;
  lastName: string;
  birthDate: Date;
  sex: string;
  homeLocationId: string;
  ownerTrainerId: string;
};

// Dokończenie profilu po logowaniu Google: tożsamość (e-mail, hasło) daje już
// Google, więc zostają pola, których nie zna - a których wymaga kartoteka.
// Ta sama reguła wieku co przy rejestracji: samodzielnie tylko pełnoletni.
export function validateProfile(input: ProfileInput, now: Date): ProfileError | null {
  if (
    !input.firstName ||
    !input.lastName ||
    !input.homeLocationId ||
    !input.ownerTrainerId ||
    (input.sex !== "MALE" && input.sex !== "FEMALE")
  ) {
    return "MISSING_FIELDS";
  }
  if (Number.isNaN(input.birthDate.getTime()) || input.birthDate > now) {
    return "INVALID_BIRTHDATE";
  }
  if (calculateAge(input.birthDate, now) < SELF_REGISTER_MIN_AGE) return "TOO_YOUNG";
  return null;
}
