import { requireRole } from "@/lib/auth/guard";
import { getClubSettings } from "@/lib/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFloorMinutesAction } from "./actions";

export default async function FloorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ zapisano?: string; blad?: string }>;
}) {
  await requireRole("ADMIN");
  const { zapisano, blad } = await searchParams;
  const { floorMinMinutes } = await getClubSettings();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Sala · odbicia</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Klubowicze i trenerzy odbijają wejście na salę osobistym kodem QR na stacji skanera.
          Kod każdy ma u siebie w aplikacji (zakładka „Mój kod wejścia”), stacja jest pod adresem{" "}
          <span className="text-text font-mono">/skaner</span>.
        </p>
      </div>

      {zapisano ? (
        <p className="border-jade/40 bg-jade/10 text-text rounded-md border p-3 text-sm">
          Zapisano. Nowy próg obowiązuje od następnego odbicia.
        </p>
      ) : null}
      {blad ? (
        <p className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          Podaj liczbę minut od 0 do 240.
        </p>
      ) : null}

      <form
        action={saveFloorMinutesAction}
        className="border-line bg-surface flex flex-col gap-4 rounded-md border p-4"
      >
        <div>
          <Label htmlFor="floorMinMinutes">Minimalny czas na sali (minuty)</Label>
          <p className="text-muted-brand mt-0.5 text-sm">
            Po odbiciu wejścia zapisujemy godzinę wejścia. Wizyta liczy się jako ważna dopiero, gdy
            od wejścia minęło co najmniej tyle minut - to blokuje „nabijanie” (odbił i wyszedł).
            Powtórne odbicie tej samej osoby w tym czasie to wciąż to samo wejście. Ustaw{" "}
            <b className="text-text">0</b>, żeby wyłączyć wymóg.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="floorMinMinutes"
              name="floorMinMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              step={1}
              required
              defaultValue={String(floorMinMinutes)}
              className="border-line bg-surface-2 max-w-28"
            />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">min</span>
          </div>
        </div>

        <p className="border-line bg-surface-2 text-muted-brand rounded-md border p-3 text-sm">
          Teraz obowiązuje:{" "}
          <b className="text-text">
            {floorMinMinutes > 0 ? `${floorMinMinutes} min` : "brak wymogu"}
          </b>
          .
        </p>

        <Button type="submit" className="self-start">
          Zapisz
        </Button>
      </form>
    </div>
  );
}
