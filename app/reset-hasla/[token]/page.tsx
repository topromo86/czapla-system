import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isResetTokenValid } from "@/lib/services/password-reset";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Ustaw nowe hasło - Czapla Boxing",
};

export default async function ResetTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <Card className="border-line bg-surface w-full max-w-sm">
        <CardHeader className="items-center justify-items-center">
          <span className="inline-flex rounded-md px-3 py-2 dark:bg-white">
            <Image src="/logo.png" alt="Czapla Boxing" width={180} height={99} priority />
          </span>
          <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
            Nowe hasło
          </p>
        </CardHeader>
        <CardContent>
          {valid ? (
            <ResetForm token={token} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="border-red bg-surface text-text rounded-md border p-3 text-sm">
                Ten link wygasł lub został już użyty. Poproś o nowy.
              </p>
              <Link
                href="/reset-hasla"
                className="text-brand-red text-center text-sm underline"
              >
                Poproś o nowy link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
