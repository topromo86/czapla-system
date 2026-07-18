import Link from "next/link";
import { getAccessibleMembers } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const members = await getAccessibleMembers();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BrandHeaderLogo />
          <nav className="flex gap-4 font-mono text-xs tracking-widest uppercase">
            <Link href="/app" className="text-text hover:text-brand-red">
              Grafik
            </Link>
            <Link href="/app/zgody" className="text-text hover:text-brand-red">
              Zgody
            </Link>
          </nav>
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
