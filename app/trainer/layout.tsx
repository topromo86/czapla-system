import Link from "next/link";
import { requireTrainerSelf } from "@/lib/auth/guard";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireTrainerSelf();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-display text-brass text-lg tracking-wide">
            Klub Bokserski - Trener
          </span>
          <nav className="flex gap-4 font-mono text-xs tracking-widest uppercase">
            <Link href="/trainer" className="text-text hover:text-brass">
              Dziś
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
    </div>
  );
}
