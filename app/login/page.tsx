import type { Metadata } from "next";
import { isGoogleConfigured } from "@/auth";
import { ThemeToggle } from "../theme-toggle";
import { SiteFooter } from "../site-footer";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Logowanie - toFitCONTROL",
};

const NOTICE: Record<string, string> = {
  zarejestrowano: "Konto założone. Zaloguj się swoim e-mailem i hasłem.",
  "haslo-zmienione": "Hasło zmienione. Zaloguj się nowym hasłem.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ zarejestrowano?: string; "haslo-zmienione"?: string; powrot?: string }>;
}) {
  const params = await searchParams;
  const notice = params.zarejestrowano
    ? NOTICE.zarejestrowano
    : params["haslo-zmienione"]
      ? NOTICE["haslo-zmienione"]
      : undefined;

  return (
    <main className="relative flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      {/* Przełącznik jest też tutaj - poza panelami nie ma nagłówka, a to
          pierwszy ekran, jaki widzi nowa osoba. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <LoginForm notice={notice} googleEnabled={isGoogleConfigured()} returnTo={params.powrot} />
      <SiteFooter />
    </main>
  );
}
