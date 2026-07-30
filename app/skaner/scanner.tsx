"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scanCheckInAction, type ScanResult } from "./actions";

// Minimalny typ natywnego BarcodeDetector (brak w lib.dom). Używamy go, gdy
// przeglądarka go ma (Chromium) - bez dokładania biblioteki do dekodowania.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

function timeHM(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function Scanner({ locationId }: { locationId: string | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  // Ostatnio przetworzony kod + czas - kamera widzi ten sam QR wiele klatek z
  // rzędu, więc dławimy powtórki, żeby nie bić w serwer w kółko.
  const lastRef = useRef<{ token: string; at: number }>({ token: "", at: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState(false);

  const detectorSupported = getDetectorCtor() !== null;

  const submitToken = useCallback(
    async (token: string) => {
      if (!locationId || busyRef.current) return;
      const now = Date.now();
      if (token === lastRef.current.token && now - lastRef.current.at < 4000) return;
      lastRef.current = { token, at: now };

      busyRef.current = true;
      setPending(true);
      try {
        const res = await scanCheckInAction(token, locationId);
        setResult(res);
        if (res.ok) router.refresh();
      } finally {
        setPending(false);
        busyRef.current = false;
      }
    },
    [locationId, router],
  );

  // Pętla kamery: co ~500 ms próbujemy zdekodować klatkę.
  useEffect(() => {
    if (!cameraOn) return;
    const Ctor = getDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["qr_code"] });
    let stop = false;

    const tick = async () => {
      const video = videoRef.current;
      if (!stop && video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) await submitToken(codes[0].rawValue);
        } catch {
          // pojedyncza nieudana klatka nic nie znaczy - próbujemy dalej
        }
      }
    };
    const id = window.setInterval(tick, 500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [cameraOn, submitToken]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError(
        "Nie udało się uruchomić kamery. Sprawdź zgodę na dostęp albo użyj czytnika ręcznego poniżej.",
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-line bg-surface overflow-hidden rounded-md border">
        <video ref={videoRef} playsInline muted className="aspect-square w-full bg-black object-cover" />
      </div>

      {!cameraOn ? (
        <Button type="button" onClick={startCamera} disabled={!detectorSupported}>
          Włącz kamerę i skanuj
        </Button>
      ) : (
        <p className="text-jade text-center font-mono text-xs tracking-widest uppercase">
          Kamera aktywna · pokaż kod
        </p>
      )}

      {!detectorSupported ? (
        <p className="border-amber/40 bg-amber/5 text-amber rounded-md border p-2 text-xs">
          Ta przeglądarka nie obsługuje skanowania kamerą. Użyj czytnika QR (wpisze kod w pole
          poniżej) albo otwórz stację w przeglądarce opartej na Chrome.
        </p>
      ) : null}
      {cameraError ? (
        <p className="border-red/40 bg-red/5 text-red rounded-md border p-2 text-xs">{cameraError}</p>
      ) : null}

      {/* Ręczny fallback: sprzętowy czytnik QR działa jak klawiatura - wpisuje
          kod i Enter. Działa też do testów i gdy kamera padnie. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const token = manual.trim();
          if (token) {
            void submitToken(token);
            setManual("");
          }
        }}
        className="flex gap-2"
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="…albo wpisz/zeskanuj kod ręcznie"
          className="border-line bg-surface-2"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Odbij
        </Button>
      </form>

      {result ? (
        result.ok ? (
          <div
            className={`rounded-md border p-4 text-center ${
              result.alreadyOnFloor
                ? "border-amber/50 bg-amber/10"
                : "border-jade/50 bg-jade/10"
            }`}
          >
            <p className="text-text text-lg font-medium">{result.name}</p>
            <p className="text-muted-brand font-mono text-xs tracking-widest uppercase">
              {result.roleLabel}
            </p>
            <p className="text-text mt-2 text-sm">
              {result.alreadyOnFloor
                ? `Już na sali od ${timeHM(result.enteredAtIso)}`
                : `Wejście zapisane: ${timeHM(result.enteredAtIso)}`}
            </p>
            <p
              className={`mt-1 font-mono text-xs ${result.valid ? "text-jade" : "text-amber"}`}
            >
              {result.valid
                ? "Wizyta zaliczona ✓"
                : `Wizyta zaliczy się za ${result.minutesLeft} min`}
            </p>
          </div>
        ) : (
          <div className="border-red/50 bg-red/10 text-red rounded-md border p-4 text-center text-sm">
            {result.message}
          </div>
        )
      ) : null}
    </div>
  );
}
