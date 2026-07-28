import { requireRole } from "@/lib/auth/guard";
import { getClubSettings } from "@/lib/services/settings";
import { FONT_THEMES } from "@/lib/domain/font-themes";
import { Button } from "@/components/ui/button";
import { saveFontThemeAction } from "./actions";

export default async function AppearanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ zapisano?: string; blad?: string }>;
}) {
  await requireRole("ADMIN");
  const { zapisano, blad } = await searchParams;
  const { fontTheme } = await getClubSettings();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Wygląd · czcionki</h1>
        <p className="text-muted-brand mt-1 text-sm">
          Wybrany zestaw czcionek obowiązuje całą aplikację - panel admina, trenera i klubowicza.
          Zmiana jest natychmiastowa dla wszystkich.
        </p>
      </div>

      {zapisano ? (
        <p className="border-jade/40 bg-jade/10 text-text rounded-md border p-3 text-sm">
          Zapisano. Zestaw czcionek zmieniony dla całej aplikacji.
        </p>
      ) : null}
      {blad ? (
        <p className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          Nieznany zestaw czcionek.
        </p>
      ) : null}

      <form action={saveFontThemeAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FONT_THEMES.map((theme) => (
            <label key={theme.id} className="cursor-pointer">
              <input
                type="radio"
                name="fontTheme"
                value={theme.id}
                defaultChecked={theme.id === fontTheme}
                className="peer sr-only"
              />
              <div className="border-line bg-surface peer-checked:border-brand-red peer-checked:ring-brand-red/30 flex h-full flex-col gap-2 rounded-md border p-4 peer-checked:ring-2">
                <span
                  className="text-text truncate text-2xl leading-tight"
                  style={{ fontFamily: theme.displayVar }}
                >
                  {theme.sample}
                </span>
                <div>
                  <p className="text-text text-sm font-medium">
                    {theme.label}
                    {theme.id === fontTheme ? (
                      <span className="text-jade ml-2 font-mono text-[10px] tracking-widest uppercase">
                        Aktywny
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-brand mt-0.5 text-xs">{theme.description}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
        <Button type="submit" className="self-start">
          Zapisz zestaw
        </Button>
      </form>
    </div>
  );
}
