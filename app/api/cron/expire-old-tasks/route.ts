import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireOldTasks } from "@/lib/jobs/expire-old-tasks";

// Vercel Cron, codziennie ok. 06:15 czasu Warszawy (patrz vercel.json).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireOldTasks(prisma);
  return NextResponse.json({ ok: true, ...result });
}
