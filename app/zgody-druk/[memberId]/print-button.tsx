"use client";

// Pasek akcji wydruku - chowany przy drukowaniu (print:hidden), żeby nie
// pojawił się na kartce.
export function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[800px] items-center justify-between gap-3 px-6 py-4 print:hidden">
      <a href={backHref} className="text-brand-red text-sm underline">
        ← Wróć do zgód
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="bg-brand-red rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Drukuj
      </button>
    </div>
  );
}
