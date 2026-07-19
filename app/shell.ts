// Jedna szerokość strony dla wszystkich paneli: płynna, ograniczona do 1400px.
//
// Wcześniej każdy layout miał własną wartość, a nagłówek szerszą niż treść pod
// nim (admin: 6xl vs 4xl) - menu wisiało nad pustą przestrzenią, nierówno
// z zawartością. Jedna stała trzyma nagłówek i treść w tej samej osi.
//
// 1400px, a nie pełna szerokość ekranu: przy 2560px tabele rozjeżdżałyby się
// na całą przekątną, a oko musiałoby wędrować od krawędzi do krawędzi.
export const PAGE_SHELL = "mx-auto w-full max-w-[1400px] px-4";

// Długie akapity (panele "Wyjaśnienie statystyk", "Jak to działa") dostają
// własny limit w znakach - przy 1400px wiersz tekstu byłby nieczytelnie długi.
// Tabele i siatka plannera celowo korzystają z pełnej szerokości.
export const PROSE_WIDTH = "max-w-[72ch]";
