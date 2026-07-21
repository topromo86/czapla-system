import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CompleteProfileForm } from "./complete-form";

export const metadata: Metadata = {
  title: "Dokończ profil - Czapla Boxing",
};

// Dwie pierwsze części pełnego imienia lądują w imieniu/nazwisku; klient i tak
// może to poprawić. Google podaje jeden "name", więc dzielimy zachowawczo.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: full.trim(), lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export default async function CompleteProfilePage() {
  const session = await requireRole("MEMBER");

  // Ma już kartotekę - nie ma czego dokańczać.
  const member = await prisma.member.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (member) redirect("/app");

  const [locations, trainers] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.trainer.findMany({
      where: { active: true },
      orderBy: { user: { name: "asc" } },
      select: { id: true, user: { select: { name: true } } },
    }),
  ]);

  const { firstName, lastName } = splitName(session.user.name ?? "");

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <Card className="border-line bg-surface w-full max-w-md">
        <CardHeader className="items-center justify-items-center">
          <span className="inline-flex rounded-md px-3 py-2 dark:bg-white">
            <Image src="/logo.png" alt="Czapla Boxing" width={180} height={99} priority />
          </span>
          <p className="text-muted-brand mt-2 font-mono text-xs tracking-widest uppercase">
            Dokończ profil
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-muted-brand mb-4 text-sm">
            Zalogowano przez Google. Uzupełnij jeszcze kilka danych, których Google nie zna, a
            których potrzebujemy do zapisów.
          </p>
          <CompleteProfileForm
            locations={locations}
            trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
            defaultFirstName={firstName}
            defaultLastName={lastName}
          />
        </CardContent>
      </Card>
    </main>
  );
}
