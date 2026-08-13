import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// RODO - prawo do przenoszenia/wglądu w dane. Pełny zrzut wszystkiego, co
// system wie o kliencie, jako plik do pobrania. Admin-only (klient prosi
// osobiście/mailowo, nie ma samoobsługowego eksportu - brak infrastruktury
// pewnej weryfikacji tożsamości przez /app).
export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  await requireRole("ADMIN");
  const { memberId } = await params;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { email: true, phone: true, name: true } },
      guardianUser: { select: { email: true, phone: true, name: true } },
      ownerTrainer: { include: { user: { select: { name: true } } } },
      homeLocation: { select: { name: true } },
      passes: { include: { plan: true } },
      payments: true,
      attendances: { include: { session: { select: { name: true, startsAt: true } } } },
      bookings: { include: { session: { select: { name: true, startsAt: true } } } },
      notes: true,
      onboardingSteps: true,
      retentionTasks: true,
      churnSurveys: { include: { reason: true } },
      ratings: true,
      consents: { include: { consentType: { select: { key: true, label: true } } } },
      measurements: true,
      absenceReports: true,
      referralsMade: true,
      referralsReceived: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const body = JSON.stringify(member, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="klient-${memberId}.json"`,
    },
  });
}
