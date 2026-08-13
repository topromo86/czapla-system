import { NextResponse } from "next/server";
import {
  handleLeadgenWebhook,
  isMetaWebhookReady,
  readMetaConfig,
  verifyMetaSignature,
} from "@/lib/services/meta-leads";

// Gniazdo na leady z Meta (Facebook/Instagram Lead Ads).
//
// Adres do wpisania w panelu Meta:  https://<domena>/api/leady/meta
//
// GET  - jednorazowa weryfikacja adresu przy podpinaniu (Meta odsyła challenge).
// POST - właściwe zgłoszenia; każde ma podpis, który sprawdzamy sekretem
//        aplikacji. Bez podpisu każdy, kto zna adres, wstrzykiwałby leady.
//
// Endpoint jest publiczny z natury (woła go Meta, nie zalogowany człowiek),
// więc podpis jest tu JEDYNĄ kontrolą dostępu - stąd brak jakiejkolwiek
// ścieżki, która pomija sprawdzenie.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const { verifyToken } = readMetaConfig();
  if (!verifyToken) {
    return NextResponse.json({ error: "Meta nie jest skonfigurowana." }, { status: 503 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    // Meta oczekuje samego challenge jako czystego tekstu.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Weryfikacja odrzucona." }, { status: 403 });
}

export async function POST(request: Request) {
  if (!isMetaWebhookReady()) {
    return NextResponse.json({ error: "Meta nie jest skonfigurowana." }, { status: 503 });
  }

  // Podpis liczy się z SUROWEGO ciała - po JSON.parse i ponownym serializowaniu
  // bajty potrafią się różnić (kolejność kluczy, białe znaki) i podpis przestaje
  // się zgadzać. Dlatego czytamy tekst, a dopiero potem parsujemy.
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Nieprawidłowy podpis." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe ciało żądania." }, { status: 400 });
  }

  const result = await handleLeadgenWebhook(body);

  // Meta ponawia wywołanie, gdy nie dostanie 200 w kilka sekund. Odpowiadamy
  // sukcesem także wtedy, gdy nic nie utworzyliśmy (duplikat) - to nie jest
  // błąd, tylko powtórka.
  return NextResponse.json({ ok: true, ...result });
}
