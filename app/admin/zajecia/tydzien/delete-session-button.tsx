"use client";

import { deleteSessionAction } from "../actions";

// Przycisk "Usuń" w menu kafelka. Klient tylko po to, żeby dopiąć potwierdzenie
// (confirm) przed wysłaniem - samo usuwanie robi server action. Zajęcia z
// zapisami i tak nie znikają po cichu (akcja kieruje wtedy do odwołania z
// powodem), ale potwierdzenie chroni przed przypadkowym kliknięciem.
export function DeleteSessionButton({
  sessionId,
  returnTo,
  sessionName,
  className,
}: {
  sessionId: string;
  returnTo: string;
  sessionName: string;
  className?: string;
}) {
  return (
    <form
      action={deleteSessionAction}
      onSubmit={(e) => {
        if (!window.confirm(`Usunąć zajęcia „${sessionName}”?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" className={className}>
        Usuń
      </button>
    </form>
  );
}
