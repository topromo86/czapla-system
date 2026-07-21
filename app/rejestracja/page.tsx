import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Rejestracja - Czapla Boxing",
};

export default async function RegisterPage() {
  // Zalogowany nie ma po co zakładać kolejnego konta.
  const session = await auth();
  if (session?.user) redirect("/app");

  const [locations, trainers] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.trainer.findMany({
      where: { active: true },
      orderBy: { user: { name: "asc" } },
      select: { id: true, user: { select: { name: true } } },
    }),
  ]);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <RegisterForm
        locations={locations}
        trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
      />
    </main>
  );
}
