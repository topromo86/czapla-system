import { prisma } from "@/lib/prisma";
import { requireTrainerSelf } from "@/lib/auth/guard";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav } from "../header-nav";
import { LogoutButton } from "../logout-button";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const { trainer } = await requireTrainerSelf();
  const openAlertsCount = await prisma.retentionTask.count({
    where: { trainerId: trainer.id, closedAt: null },
  });

  const navItems = [
    { href: "/trainer", label: "Dziś" },
    { href: "/trainer/kasa", label: "Kasa" },
    { href: "/trainer/alerty", label: "Alerty", badge: openAlertsCount || undefined },
    { href: "/trainer/podopieczni", label: "Podopieczni" },
    { href: "/trainer/sparingi", label: "Sparingi" },
    { href: "/trainer/karta", label: "Moja karta" },
    { href: "/trainer/aktywnosc", label: "Aktywność" },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-line bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandHeaderLogo />
            <span className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              Trener
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav items={navItems} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</main>
    </div>
  );
}
