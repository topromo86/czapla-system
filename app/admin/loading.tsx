import { PageSkeleton } from "../page-skeleton";

// Widok zastępczy na czas ładowania stron tej sekcji. Next pokazuje go
// automatycznie przy przejściu, dopóki strona czeka na dane.
export default function Loading() {
  return <PageSkeleton />;
}
