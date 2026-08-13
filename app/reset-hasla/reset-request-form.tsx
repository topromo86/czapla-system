"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestResetAction, type RequestState } from "./actions";

const initialState: RequestState = {};

export function ResetRequestForm() {
  const [state, formAction, isPending] = useActionState(requestResetAction, initialState);

  if (state.done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="border-jade bg-surface text-text rounded-md border p-3 text-sm">
          Jeśli konto z tym adresem istnieje, wysłaliśmy link do ustawienia nowego hasła. Sprawdź
          skrzynkę (także folder spam). Link jest ważny 2 godziny.
        </p>
        <Link
          href="/login"
          className="text-muted-brand hover:text-brand-red text-center text-sm underline"
        >
          Wróć do logowania
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="font-mono text-xs tracking-widest uppercase">
          E-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="border-line bg-surface-2"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-red text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Wysyłanie..." : "Wyślij link do resetu"}
      </Button>
      <Link
        href="/login"
        className="text-muted-brand hover:text-brand-red text-center text-sm underline"
      >
        Wróć do logowania
      </Link>
    </form>
  );
}
