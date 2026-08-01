// Zastępczy widok pokazywany podczas przechodzenia między podstronami.
//
// Next renderuje go z pliku loading.tsx danej sekcji, gdy strona czeka na dane
// z bazy. Nawigacja i nagłówek zostają w tym czasie klikalne - wymienia się
// wyłącznie treść strony, więc szkielet naśladuje jej układ: tytuł, podtytuł
// i kilka kart.
//
// Świadomie NIE jest to kręcące się kółko: bloki w miejscach, gdzie zaraz
// pojawi się treść, nie przesuwają układu po załadowaniu i od razu podpowiadają,
// czego się spodziewać.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`bg-surface-2 animate-pulse rounded ${className}`} />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    // aria-busy + tekst dla czytników ekranu - sam wzór wizualny nie mówi
    // niewidomemu użytkownikowi, że coś się ładuje.
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Ładowanie strony…</span>

      <div className="flex flex-col gap-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-72 max-w-full" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-line bg-surface flex flex-col gap-3 rounded-md border p-4">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
