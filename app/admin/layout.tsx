import { requireRole } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav } from "../header-nav";
import { LogoutButton } from "../logout-button";

const NAV_ITEMS = [
  { href: "/admin", label: "Karnety" },
  { href: "/admin/zajecia", label: "Zajęcia" },
  { href: "/admin/trenerzy", label: "Trenerzy" },
  { href: "/admin/klienci/nowy", label: "Dodaj klienta" },
  { href: "/admin/finanse", label: "Finanse" },
  { href: "/admin/kasa", label: "Kasa" },
  { href: "/admin/retencja", label: "Retencja" },
  { href: "/admin/ranking", label: "Ranking" },
  { href: "/admin/oblozenie", label: "Obłożenie" },
  { href: "/admin/powody-odejsc", label: "Powody odejść" },
  { href: "/admin/audyt-notatek", label: "Audyt notatek" },
  { href: "/admin/aktywnosc", label: "Aktywność" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandHeaderLogo />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Admin
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav items={NAV_ITEMS} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4">{children}</main>
    </div>
  );
}
