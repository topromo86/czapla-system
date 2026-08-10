import "server-only";
import { headers } from "next/headers";

// Adres aplikacji odczytany z nagłówków żądania. Link w kodzie QR (i w mailach)
// musi wskazywać na ten sam host, z którego przyszło żądanie - inaczej kod
// wygenerowany na podglądzie prowadziłby na produkcję i odwrotnie. Bez
// wpisywania adresu na sztywno w konfiguracji.
export async function requestBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
