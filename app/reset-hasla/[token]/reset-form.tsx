"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/registration";
import { resetPasswordAction, type ResetState } from "../actions";

const initialState: ResetState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="font-mono text-xs tracking-widest uppercase">
          Nowe hasło
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          className="border-line bg-surface-2"
        />
        <p className="text-muted-brand text-xs">
          Min. {PASSWORD_MIN_LENGTH} znaków, w tym litera i cyfra.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword" className="font-mono text-xs tracking-widest uppercase">
          Powtórz hasło
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          className="border-line bg-surface-2"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-red text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Zapisywanie..." : "Ustaw nowe hasło"}
      </Button>
    </form>
  );
}
