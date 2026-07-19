import { prisma } from "@/lib/prisma";

// Zdjęcie trenera prosto z bazy. Osobny endpoint zamiast data URI w HTML -
// dzięki temu lista trenerów nie ciągnie za każdym razem kilkuset kB base64,
// a przeglądarka może obrazek zacache'ować.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  const { trainerId } = await params;

  const trainer = await prisma.trainer.findUnique({
    where: { id: trainerId },
    select: { photo: true, photoMimeType: true, updatedAt: true },
  });

  if (!trainer?.photo || !trainer.photoMimeType) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(trainer.photo), {
    headers: {
      "Content-Type": trainer.photoMimeType,
      // Krótki cache + ETag: podmiana zdjęcia jest widoczna od razu po
      // odświeżeniu, a nie trzyma się przez godzinę.
      "Cache-Control": "public, max-age=60, must-revalidate",
      ETag: `"${trainer.updatedAt.getTime()}"`,
    },
  });
}
