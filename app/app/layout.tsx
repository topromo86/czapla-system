import { getAccessibleMembers, requireSession } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav } from "../header-nav";
import { LogoutButton } from "../logout-button";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const members = await getAccessibleMembers();

  const navItems = [
    { href: "/app", label: "Grafik" },
    { href: "/app/indywidualne", label: "Indywidualne" },
    { href: "/app/trenerzy", label: "Trenerzy" },
    { href: "/app/karnet", label: "Mój karnet" },
    { href: "/app/postepy", label: "Postępy" },
    { href: "/app/polecenia", label: "Polecenia" },
    ...(session.user.role === "GUARDIAN" ? [{ href: "/app/dziecko", label: "Moje dziecko" }] : []),
    { href: "/app/zgody", label: "Zgody" },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BrandHeaderLogo />
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav items={navItems} />
            <LogoutButton />
          </div>
        </div>
      </header>
      {members.length === 0 ? (
        <main className="mx-auto w-full max-w-3xl flex-1 p-4">
          <p className="text-muted-brand">
            To konto nie ma jeszcze przypisanego profilu klienta. Skontaktuj się z klubem.
          </p>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
      )}
    </div>
  );
}
