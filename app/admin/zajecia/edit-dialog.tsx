"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Okno edycji zajęć. Otwiera się samo, gdy strona wejdzie w tryb edycji
// (?edit=id) - dzięki temu kliknięcie „Edytuj" w plannerze pokazuje formularz
// od razu jako modal, zamiast przewijać na dół strony. Zamknięcie (Escape, tło,
// przycisk) czyści ?edit, żeby wrócić do czystego widoku.
//
// Treść (formularz) jest renderowana po stronie serwera i przekazana jako
// children - modal tylko ją opakowuje i steruje otwarciem.
export function EditDialog({
  closeHref,
  children,
}: {
  closeHref: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    // showModal to sterowanie DOM (systemem zewnętrznym), nie setState -
    // dozwolone w efekcie.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={() => router.push(closeHref, { scroll: false })}
      className="bg-surface text-text border-line max-h-[85vh] w-[min(92vw,44rem)] overflow-y-auto rounded-lg border p-5 shadow-xl backdrop:bg-black/60"
    >
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="text-muted-brand hover:text-brand-red text-sm"
        >
          ✕ Zamknij
        </button>
      </div>
      {children}
    </dialog>
  );
}
