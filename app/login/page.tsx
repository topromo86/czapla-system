import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Logowanie - Czapla Boxing",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-4">
      <LoginForm />
      <p className="text-muted-brand font-mono text-[10px] tracking-widest uppercase">
        v{process.env.npm_package_version ?? "0.1.0"} · built by{" "}
        <a
          href="https://topromo.pl"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-red underline"
        >
          toPROMO Group Sp. z o.o.
        </a>
      </p>
    </main>
  );
}
