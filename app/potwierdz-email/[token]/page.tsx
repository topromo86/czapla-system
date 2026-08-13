import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { verifyEmailToken } from "@/lib/services/email-verification";

export const metadata: Metadata = {
  title: "Potwierdzenie e-maila - toFitCONTROL",
};

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyEmailToken(token);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <Card className="border-line bg-surface w-full max-w-sm">
        <CardHeader className="items-center justify-items-center">
          <span className="inline-flex rounded-md px-3 py-2 dark:bg-white">
            <Image src="/logo.png" alt="Czapla Boxing" width={180} height={99} priority />
          </span>
          <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
            Potwierdzenie e-maila
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {result === "OK" ? (
            <p className="border-jade bg-surface text-text rounded-md border p-3 text-sm">
              Adres e-mail potwierdzony. Dziękujemy!
            </p>
          ) : (
            <p className="border-red bg-surface text-text rounded-md border p-3 text-sm">
              Ten link wygasł lub został już użyty. Zaloguj się i wyślij nowy z paska u góry
              aplikacji.
            </p>
          )}
          <Link href="/app" className="text-brand-red text-center text-sm underline">
            Przejdź do aplikacji
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
