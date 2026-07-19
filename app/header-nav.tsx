"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeaderNavItem = { href: string; label: string; badge?: number };

// Najbardziej dopasowany (najdłuższy) href spośród tych, które są prefiksem
// aktualnej ścieżki - unika sytuacji, w której dwa zagnieżdżone linki
// (np. "/admin" i "/admin/finanse") są podświetlone jednocześnie.
function findActiveHref(pathname: string, hrefs: string[]): string | undefined {
  const matches = hrefs.filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  if (matches.length === 0) return undefined;
  return matches.reduce((longest, href) => (href.length > longest.length ? href : longest));
}

// Nawigacja nagłówka: pełny rząd linków od `xl` w górę (na węższych ekranach
// za dużo pozycji nie mieści się bez zawijania), poniżej tego - rozwijane
// menu (natywny <details>, zero JS) żeby nie nachodziło na logo na
// telefonie. `overflow-x-auto` + `shrink-0` na linkach to zabezpieczenie,
// gdyby nawet przy `xl` lista była zbyt długa - przewija się zamiast się
// łamać/nakładać. Współdzielone przez /admin, /trainer, /app (SPEC.md:
// mobile-first).
export function HeaderNav({ items }: { items: HeaderNavItem[] }) {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    items.map((item) => item.href),
  );

  // <details> nie zamyka się samo po kliknięciu linku, bo Next.js robi
  // nawigację po stronie klienta (brak przeładowania, layout zostaje
  // zamontowany) - trzeba zamknąć ręcznie, inaczej rozwinięte menu zasłania
  // ekran aż do "odklikania".
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  return (
    <>
      <nav className="hidden min-w-0 items-center gap-4 overflow-x-auto font-mono text-xs tracking-widest uppercase xl:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-text hover:text-brand-red shrink-0 whitespace-nowrap",
              item.href === activeHref && "font-bold",
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="bg-red ml-1 rounded-full px-1.5 py-0.5 text-white">
                {item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <details ref={detailsRef} className="relative xl:hidden">
        <summary
          aria-label="Menu"
          className="border-line bg-surface-2 flex size-11 cursor-pointer list-none items-center justify-center rounded-md border [&::-webkit-details-marker]:hidden"
        >
          <Menu className="size-5" />
        </summary>
        <nav className="border-line bg-surface absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-md border p-2 font-mono text-xs tracking-widest uppercase shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-text hover:text-brand-red hover:bg-surface-2 rounded-md px-3 py-2.5",
                item.href === activeHref && "font-bold",
              )}
            >
              {item.label}
              {item.badge ? (
                <span className="bg-red ml-1 rounded-full px-1.5 py-0.5 text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </details>
    </>
  );
}
