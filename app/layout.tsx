import type { Metadata, Viewport } from "next";
import { Anton, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./register-service-worker";
import { THEME_INIT_SCRIPT } from "./theme-toggle";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "toFitCONTROL",
  description: "toFitCONTROL - system zarządzania klubem sportowym",
  appleWebApp: {
    capable: true,
    title: "toFitCONTROL",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Kolor paska przeglądarki/systemu. Idzie za ustawieniem systemu, a nie za
  // naszym przełącznikiem - przeglądarka czyta to z metatagu przy ładowaniu.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#15171a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`${anton.variable} ${archivo.variable} ${ibmPlexMono.variable} h-full antialiased`}
      // Skrypt motywu dopisuje klasę `dark` do <html> przed hydratacją, więc
      // serwer i klient widzą tu różny className. To zamierzone.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
