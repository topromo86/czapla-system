import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeCashDay } from "@/lib/jobs/close-cash-day";
import { todayInTimeZone } from "@/lib/domain/time";

// Vercel Cron, codziennie 22:00 czasu Warszawy (patrz vercel.json - harmonogram
// w UTC, przybliżenie jak w generate-sessions).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await closeCashDay(prisma, todayInTimeZone(new Date()));
  return NextResponse.json({ ok: true, ...result });
}
