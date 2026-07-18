"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <Card className="border-line bg-surface w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display text-brass text-2xl tracking-wide">
          Klub Bokserski
        </CardTitle>
        <p className="text-muted-brand font-mono text-xs tracking-widest uppercase">Logowanie</p>
      </CardHeader>
      <CardContent>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="font-mono text-xs tracking-widest uppercase">
              Hasło
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="border-line bg-surface-2"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-red text-sm">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending} className="mt-2">
            {isPending ? "Logowanie..." : "Zaloguj się"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
