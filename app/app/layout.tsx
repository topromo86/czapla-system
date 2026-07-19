import { getAccessibleMembers, requireSession } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav, type HeaderNavGroup } from "../header-nav";
import { PAGE_SHELL } from "../shell";
import { SignedInAs } from "../signed-in-as";
import { LogoutButton } from "../logout-button";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const members = await getAccessibleMembers();

  // Zapisy zostają na jedno kliknięcie - to po nie klient wchodzi do apki.
  // Reszta schowana w dwóch grupach, więc nic nie jest dalej niż dwa kliknięcia.
  const navGroups: HeaderNavGroup[] = [
    { label: "Grafik", items: [{ href: "/app", label: "Grafik" }] },
    { label: "Indywidualne", items: [{ href: "/app/indywidualne", label: "Indywidualne" }] },
    {
      label: "Moje konto",
      items: [
        { href: "/app/karnet", label: "Mój karnet" },
        { href: "/app/postepy", label: "Postępy" },
        ...(session.user.role === "GUARDIAN"
          ? [{ href: "/app/dziecko", label: "Moje dziecko" }]
          : []),
        { href: "/app/zgody", label: "Zgody" },
      ],
    },
    {
      label: "Klub",
      items: [
        { href: "/app/trenerzy", label: "Trenerzy" },
        { href: "/app/polecenia", label: "Polecenia" },
      ],
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b py-3">
        <div className={`${PAGE_SHELL} flex items-center justify-between gap-4`}>
          <div className="flex shrink-0 items-center gap-3">
            <BrandHeaderLogo />
            <SignedInAs name={session.user.name} />
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav groups={navGroups} />
            <LogoutButton />
          </div>
        </div>
      </header>
      {members.length === 0 ? (
        <main className={`${PAGE_SHELL} flex-1 py-4`}>
          <p className="text-muted-brand">
            To konto nie ma jeszcze przypisanego profilu klienta. Skontaktuj się z klubem.
          </p>
        </main>
      ) : (
        <main className={`${PAGE_SHELL} flex-1 py-4`}>{children}</main>
      )}
    </div>
  );
}
