import "server-only";
import { Prisma, type PrismaClient, type LeadActivityKind } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LEAD_SOURCE_LABEL, parseLeadsCsv } from "@/lib/domain/lead-import";

type Tx = PrismaClient | Prisma.TransactionClient;

// Jedno miejsce zapisu historii aktywności leada (kiedy kontakt, co ustalono,
// zmiany statusu, przypomnienia, konwersja). Zostaje przy leadzie także po
// założeniu konta - dzięki temu pełną historię widać również z karty klienta.
export async function logLeadActivity(
  tx: Tx,
  params: { leadId: string; actorUserId: string | null; kind: LeadActivityKind; summary: string },
) {
  await tx.leadActivity.create({
    data: {
      leadId: params.leadId,
      actorUserId: params.actorUserId,
      kind: params.kind,
      summary: params.summary,
    },
  });
}

export type ImportResult = { created: number; duplicates: number; skipped: number };

// Import leadów z pliku CSV (eksport z Meta). Deduplikacja po (source,
// externalId) - powtórny import tego samego pliku nie tworzy duplikatów.
// Każdy nowy lead dostaje wpis IMPORTED w historii.
export async function importLeadsFromCsv(input: {
  csv: string;
  actorUserId: string;
}): Promise<ImportResult> {
  const { leads, skipped } = parseLeadsCsv(input.csv);
  let created = 0;
  let duplicates = 0;

  for (const l of leads) {
    if (l.externalId) {
      const existing = await prisma.lead.findUnique({
        where: { source_externalId: { source: l.source, externalId: l.externalId } },
        select: { id: true },
      });
      if (existing) {
        duplicates++;
        continue;
      }
    }

    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          source: l.source,
          externalId: l.externalId,
          fullName: l.fullName,
          email: l.email,
          phone: l.phone,
          campaign: l.campaign,
          rawData: l.rawData as Prisma.InputJsonValue,
        },
      });
      await logLeadActivity(tx, {
        leadId: lead.id,
        actorUserId: input.actorUserId,
        kind: "IMPORTED",
        summary: `Zaimportowano z: ${LEAD_SOURCE_LABEL[l.source]}${l.campaign ? ` · ${l.campaign}` : ""}`,
      });
    });
    created++;
  }

  return { created, duplicates, skipped };
}
