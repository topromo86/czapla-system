"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <Card className="border-line bg-surface w-full max-w-sm">
      <CardHeader className="items-center justify-items-center">
        {/* Jasna podkładka w trybie ciemnym - logo ma czarny napis, patrz
            app/brand-header-logo.tsx */}
        <span className="inline-flex rounded-md px-3 py-2 dark:bg-white">
          <Image src="/logo.png" alt="Czapla Boxing" width={220} height={121} priority />
        </span>
        <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
          Logowanie
        </p>
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
