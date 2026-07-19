import { requireRole } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav, type HeaderNavGroup } from "../header-nav";
import { PAGE_SHELL } from "../shell";
import { LogoutButton } from "../logout-button";

// Pogrupowane tematycznie - płaska lista urosła do kilkunastu pozycji i
// przestawała się mieścić w nagłówku. Każdy ekran jest najwyżej dwa
// kliknięcia od startu (grupa → pozycja).
const NAV_GROUPS: HeaderNavGroup[] = [
  {
    label: "Klienci",
    items: [
      { href: "/admin", label: "Karnety" },
      { href: "/admin/klienci/nowy", label: "Dodaj klienta" },
    ],
  },
  {
    label: "Grafik",
    items: [
      { href: "/admin/zajecia", label: "Zajęcia" },
      { href: "/admin/oblozenie", label: "Obłożenie sal" },
    ],
  },
  {
    label: "Pieniądze",
    items: [
      { href: "/admin/kasa", label: "Kasa" },
      { href: "/admin/finanse", label: "Finanse" },
    ],
  },
  {
    label: "Zespół",
    items: [
      { href: "/admin/trenerzy", label: "Trenerzy" },
      { href: "/admin/ranking", label: "Ranking" },
    ],
  },
  {
    label: "Retencja",
    items: [
      { href: "/admin/retencja", label: "Przegląd" },
      { href: "/admin/powody-odejsc", label: "Powody odejść" },
      { href: "/admin/audyt-notatek", label: "Audyt notatek" },
    ],
  },
  { label: "Aktywność", items: [{ href: "/admin/aktywnosc", label: "Aktywność" }] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b py-3">
        <div className={`${PAGE_SHELL} flex items-center justify-between gap-4`}>
          <div className="flex shrink-0 items-center gap-3">
            <BrandHeaderLogo />
            <span className="text-muted-brand hidden font-mono text-xs tracking-widest uppercase sm:inline">
              Admin
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav groups={NAV_GROUPS} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className={`${PAGE_SHELL} flex-1 py-4`}>{children}</main>
    </div>
  );
}
