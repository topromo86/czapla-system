import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="font-display text-brass text-lg tracking-wide">
            Klub Bokserski - Admin
          </span>
          <nav className="flex gap-4 font-mono text-xs tracking-widest uppercase">
            <Link href="/admin" className="text-text hover:text-brass">
              Karnety
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4">{children}</main>
    </div>
  );
}
