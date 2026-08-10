import { requireRole } from "@/lib/auth/guard";
import { getClubSettings } from "@/lib/services/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveClassQrSettingsAction, saveFloorMinutesAction } from "./actions";

export default async function FloorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ zapisano?: string; blad?: string; zapisanoQr?: string; bladQr?: string }>;
}) {
  await requireRole("ADMIN");
  const { zapisano, blad, zapisanoQr, bladQr } = await searchParams;
  const { floorMinMinutes, qrOpensMinutesBefore, trainerCheckInMinutesBefore } =
    await getClubSettings();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Sala · odbicia</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Klubowicze i trenerzy odbijają wejście na salę osobistym kodem QR na stacji skanera. Kod
          każdy ma u siebie w aplikacji (zakładka „Mój kod wejścia”), stacja jest pod adresem{" "}
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
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              min
            </span>
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

      {/* Kod QR zajęć - osobna sekcja, bo dotyczy odbić NA ZAJĘCIACH, a nie
          samego wejścia na obiekt. */}
      <div>
        <h2 className="font-display text-brand-red text-xl tracking-wide">Kod QR zajęć</h2>
        <p className="text-muted-brand mt-1 text-sm">
          Tablet na sali pokazuje kod najbliższych zajęć. Trener i klubowicze skanują go własnym
          telefonem. Każde zajęcia mają własny kod, więc zdjęcie wczorajszego ekranu nikogo nie
          wpuści.
        </p>
      </div>

      {zapisanoQr ? (
        <p className="border-jade/40 bg-jade/10 text-jade rounded-md border p-3 text-sm">
          Zapisano. Nowe ustawienia obowiązują od kolejnych zajęć.
        </p>
      ) : null}
      {bladQr === "1" ? (
        <p className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          Kod może pojawiać się od 1 do 120 minut przed zajęciami.
        </p>
      ) : null}
      {bladQr === "2" ? (
        <p className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          Termin odbicia trenera musi mieścić się w oknie kodu - inaczej trener nie miałby czym
          odbić się na czas.
        </p>
      ) : null}

      <form
        action={saveClassQrSettingsAction}
        className="border-line bg-surface flex flex-col gap-4 rounded-md border p-4"
      >
        <div>
          <Label htmlFor="qrOpensMinutesBefore">Kod pojawia się przed zajęciami (minuty)</Label>
          <p className="text-muted-brand mt-0.5 text-sm">
            Wcześniej na ekranie nie ma czego skanować. Kod znika z końcem zajęć.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="qrOpensMinutesBefore"
              name="qrOpensMinutesBefore"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              step={1}
              required
              defaultValue={String(qrOpensMinutesBefore)}
              className="border-line bg-surface-2 max-w-28"
            />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              min
            </span>
          </div>
        </div>

        <div>
          <Label htmlFor="trainerCheckInMinutesBefore">
            Trener odbija się najpóźniej przed zajęciami (minuty)
          </Label>
          <p className="text-muted-brand mt-0.5 text-sm">
            Późniejsze odbicie nadal się zapisuje - inaczej zajęcia zostałyby bez śladu - ale jest
            oznaczone jako spóźnione. Brak odbicia po tym czasie trafia na Twój pulpit.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="trainerCheckInMinutesBefore"
              name="trainerCheckInMinutesBefore"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              step={1}
              required
              defaultValue={String(trainerCheckInMinutesBefore)}
              className="border-line bg-surface-2 max-w-28"
            />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              min
            </span>
          </div>
        </div>

        <p className="border-line bg-surface-2 text-muted-brand rounded-md border p-3 text-sm">
          Teraz obowiązuje: kod <b className="text-text">{qrOpensMinutesBefore} min</b> przed
          startem, trener najpóźniej <b className="text-text">{trainerCheckInMinutesBefore} min</b>{" "}
          przed.
        </p>

        <Button type="submit" className="self-start">
          Zapisz
        </Button>
      </form>
    </div>
  );
}
