import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandHeaderLogo />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Admin
            </span>
          </div>
          <nav className="flex gap-4 font-mono text-xs tracking-widest uppercase">
            <Link href="/admin" className="text-text hover:text-brand-red">
              Karnety
            </Link>
            <Link href="/admin/finanse" className="text-text hover:text-brand-red">
              Finanse
            </Link>
            <Link href="/admin/kasa" className="text-text hover:text-brand-red">
              Kasa
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4">{children}</main>
    </div>
  );
}
