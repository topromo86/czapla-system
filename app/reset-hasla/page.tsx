import type { Metadata } from "next";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = {
  title: "Reset hasła - toFitCONTROL",
};

export default function ResetRequestPage() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <Card className="border-line bg-surface w-full max-w-sm">
        <CardHeader className="items-center justify-items-center">
          <span className="inline-flex rounded-md px-3 py-2 dark:bg-white">
            <Image src="/logo.png" alt="Czapla Boxing" width={180} height={99} priority />
          </span>
          <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
            Reset hasła
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-muted-brand mb-4 text-sm">
            Podaj adres e-mail konta. Wyślemy link do ustawienia nowego hasła.
          </p>
          <ResetRequestForm />
        </CardContent>
      </Card>
    </main>
  );
}
