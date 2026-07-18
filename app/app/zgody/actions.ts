"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMemberAccess } from "@/lib/auth/guard";

async function clientMeta() {
  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const userAgent = h.get("user-agent") ?? "unknown";
  return { ipAddress, userAgent };
}

export async function grantConsentAction(formData: FormData) {
  const memberId = String(formData.get("memberId"));
  const consentTypeId = String(formData.get("consentTypeId"));

  const session = await requireMemberAccess(memberId);
  const consentType = await prisma.consentType.findUniqueOrThrow({ where: { id: consentTypeId } });
  const { ipAddress, userAgent } = await clientMeta();

  await prisma.consent.create({
    data: {
      memberId,
      consentTypeId,
      version: consentType.version,
      ipAddress,
      userAgent,
      grantedByUserId: session.user.id,
    },
  });

  redirect(`/app/zgody?member=${memberId}`);
}

export async function revokeConsentAction(formData: FormData) {
  const consentId = String(formData.get("consentId"));
  const memberId = String(formData.get("memberId"));

  await requireMemberAccess(memberId);

  await prisma.consent.update({
    where: { id: consentId },
    data: { revokedAt: new Date() },
  });

  redirect(`/app/zgody?member=${memberId}`);
}
