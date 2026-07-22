import { PAGE_SHELL } from "./shell";

// npm_package_version bywa niedostępne w runtime produkcyjnym (ustawiane tylko
// przez skrypty npm) - stąd fallback. Ten sam wzorzec co wcześniej na logowaniu.
const VERSION = process.env.npm_package_version ?? "0.1.0";

// Linijka stopki: nazwa systemu (z zachowaną pisownią toFitCONTROL mimo uppercase),
// wersja i twórca. Współdzielona przez ekran logowania i panele zarządzania.
export function SiteFooter({ className }: { className?: string }) {
  return (
    <p
      className={`text-muted-brand text-center font-mono text-[10px] tracking-widest uppercase ${className ?? ""}`}
    >
      <span className="text-text normal-case">toFitCONTROL</span> · v{VERSION} · built by{" "}
      <a
        href="https://topromo.pl"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-brand-red underline"
      >
        toPROMO Group Sp. z o.o.
      </a>
    </p>
  );
}

// Pasek stopki dla paneli (admin/trener): obwódka u góry, wyrównany do szerokości
// strony. W layoutach idzie po <main class="flex-1">, więc ląduje na samym dole.
export function PanelFooter() {
  return (
    <footer className="border-line bg-surface border-t py-4">
      <div className={PAGE_SHELL}>
        <SiteFooter />
      </div>
    </footer>
  );
}
