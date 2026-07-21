"use client";

import { useSearchParams } from "next/navigation";
import { resendVerificationAction } from "./resend-verification";

export function EmailVerificationBanner({ email }: { email: string }) {
  const sent = useSearchParams().get("weryfikacja-wyslana") === "1";

  return (
    <div className="border-amber bg-surface-2 border-b">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-2">
        {sent ? (
          <p className="text-text text-sm">
            Wysłaliśmy nowy link na <b>{email}</b>. Sprawdź skrzynkę (także spam).
          </p>
        ) : (
          <>
            <p className="text-text text-sm">
              Potwierdź adres <b>{email}</b> - wysłaliśmy link przy rejestracji.
            </p>
            <form action={resendVerificationAction}>
              <button
                type="submit"
                className="text-brand-red font-mono text-xs tracking-widest uppercase hover:underline"
              >
                Wyślij link ponownie
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
