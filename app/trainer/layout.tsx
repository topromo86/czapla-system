import Link from "next/link";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireTrainerSelf();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandHeaderLogo />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Trener
            </span>
          </div>
          <nav className="flex gap-4 font-mono text-xs tracking-widest uppercase">
            <Link href="/trainer" className="text-text hover:text-brand-red">
              Dziś
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
    </div>
  );
}
