import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSessions } from "@/lib/jobs/generate-sessions";

// Wywoływane przez Vercel Cron (patrz vercel.json - harmonogram w UTC, Vercel
// nie wspiera stref czasowych; "0 2 * * *" to ok. 03:00-04:00 czasu Warszawy
// zależnie od pory roku - wystarczające dla joba, który ma się odpalić wcześnie
// rano, zanim klub otworzy drzwi). Chronione CRON_SECRET, żeby nikt z zewnątrz
// nie mógł wyzwolić joba ręcznie.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateSessions(prisma);
  return NextResponse.json({ ok: true, ...result });
}
