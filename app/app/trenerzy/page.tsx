import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { TrainerAvatar } from "@/app/admin/trenerzy/trainer-avatar";

// Wizytówki kadry dla klientów. Wyciszeni trenerzy tu nie trafiają - to jest
// dokładnie sens wyciszenia: znika z oczu klienta, zostaje w historii klubu.
export default async function ClientTrainersPage() {
  await requireSession();

  const trainers = await prisma.trainer.findMany({
    where: { active: true },
    include: { user: true, location: true, locations: { orderBy: { name: "asc" } } },
    orderBy: { user: { name: "asc" } },
  });

  // Trener może pracować w kilku lokalizacjach - pokazujemy go w KAŻDEJ sekcji,
  // w której prowadzi zajęcia. Fallback na lokalizację domyślną, gdyby zestaw
  // był pusty.
  const byLocation = new Map<string, typeof trainers>();
  for (const trainer of trainers) {
    const where = trainer.locations.length > 0 ? trainer.locations : [trainer.location];
    for (const loc of where) {
      const bucket = byLocation.get(loc.name);
      if (bucket) bucket.push(trainer);
      else byLocation.set(loc.name, [trainer]);
    }
  }
  const sortedLocations = [...byLocation.entries()].sort(([a], [b]) => a.localeCompare(b, "pl"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Nasi trenerzy</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Kadra klubu. U trenerów z ustawionymi godzinami możesz umówić trening indywidualny.
        </p>
      </div>

      {trainers.length === 0 ? (
        <p className="text-muted-brand border-line bg-surface rounded-md border p-4 text-sm">
          Lista trenerów jest chwilowo niedostępna.
        </p>
      ) : (
        sortedLocations.map(([locationName, locationTrainers]) => (
          <section key={locationName}>
            <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              {locationName}
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {locationTrainers.map((trainer) => (
                <li key={trainer.id} className="border-line bg-surface rounded-md border p-4">
                  <div className="flex items-start gap-4">
                    <TrainerAvatar
                      trainerId={trainer.id}
                      name={trainer.user.name}
                      hasPhoto={trainer.photoMimeType != null}
                      size={64}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-text font-medium">{trainer.user.name}</p>
                      {trainer.bio ? (
                        <p className="text-muted-brand mt-1 text-sm whitespace-pre-line">
                          {trainer.bio}
                        </p>
                      ) : (
                        <p className="text-muted-brand mt-1 text-sm italic">Brak opisu.</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
