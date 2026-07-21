"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/services/email-verification";

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function resendVerificationAction() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, emailVerifiedAt: true },
  });

  // Już potwierdzony albo brak adresu - nie ma czego wysyłać.
  if (user?.email && !user.emailVerifiedAt) {
    await sendVerificationEmail({
      userId: session.user.id,
      email: user.email,
      name: user.name,
      baseUrl: await baseUrl(),
    });
  }
  redirect("/app?weryfikacja-wyslana=1");
}
