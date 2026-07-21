import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAccessibleMembers, requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/services/notify";
import { EmailVerificationBanner } from "./email-verification-banner";
import { BrandHeaderLogo } from "../brand-header-logo";
import { HeaderNav, type HeaderNavGroup } from "../header-nav";
import { PAGE_SHELL } from "../shell";
import { SignedInAs } from "../signed-in-as";
import { ThemeToggle } from "../theme-toggle";
import { LogoutButton } from "../logout-button";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Konto MEMBER bez kartoteki to świeże logowanie Google przed dokończeniem
  // profilu - kierujemy tam, zamiast pokazywać pustą aplikację. Konta zakładane
  // formularzem albo przez klub zawsze mają kartotekę, więc ich to nie dotyczy.
  if (session.user.role === "MEMBER") {
    const hasMember = await prisma.member.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!hasMember) redirect("/dokoncz-profil");
  }

  const members = await getAccessibleMembers();

  // Baner "potwierdź e-mail" tylko dla konta, które ma niepotwierdzony adres,
  // i tylko gdy poczta działa - inaczej "wyślij ponownie" nie miałoby jak
  // zadziałać. Konta z czasów bez SMTP są od razu weryfikowane, więc ich to
  // nie dotyczy.
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerifiedAt: true },
  });
  const showVerifyBanner =
    isEmailConfigured() && account != null && account.email != null && account.emailVerifiedAt == null;

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
        { href: "/app/powiadomienia", label: "Powiadomienia" },
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
      {showVerifyBanner && account?.email ? (
        <Suspense fallback={null}>
          <EmailVerificationBanner email={account.email} />
        </Suspense>
      ) : null}
      <header className="border-line bg-surface border-b py-3">
        <div className={`${PAGE_SHELL} flex items-center justify-between gap-4`}>
          <div className="flex shrink-0 items-center gap-3">
            <BrandHeaderLogo />
            <SignedInAs name={session.user.name} />
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <HeaderNav groups={navGroups} />
            <ThemeToggle />
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
