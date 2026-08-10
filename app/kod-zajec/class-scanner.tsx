"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stationScanAction, type StationScanView } from "./actions";

// Kamera kiosku czytająca osobiste kody rotacyjne. To jest droga prowadzącego:
// kod żyje 30 s, więc trzeba stać przy tym urządzeniu, a nie mieć zdjęcie.
//
// Ten sam mechanizm co na stacji wejścia (app/skaner/scanner.tsx): natywny
// BarcodeDetector, bez dokładania biblioteki do dekodowania. Gdy przeglądarka
// go nie ma, zostaje pole na czytnik ręczny - kiosk ma działać także na starym
// tablecie.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

export function ClassScanner({ locationId }: { locationId: string | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  // Kamera widzi ten sam kod wiele klatek z rzędu. Dławimy powtórki, ale
  // krócej niż 30 s, żeby kolejna osoba nie czekała na odblokowanie.
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<StationScanView | null>(null);
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState(false);

  const detectorSupported = getDetectorCtor() !== null;

  const submit = useCallback(
    async (code: string) => {
      if (!locationId || busyRef.current) return;
      const now = Date.now();
      if (code === lastRef.current.code && now - lastRef.current.at < 4000) return;
      lastRef.current = { code, at: now };

      busyRef.current = true;
      setPending(true);
      try {
        const res = await stationScanAction(code, locationId);
        setResult(res);
        if (res.ok) router.refresh();
      } finally {
        setPending(false);
        busyRef.current = false;
      }
    },
    [locationId, router],
  );

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
          if (codes[0]?.rawValue) await submit(codes[0].rawValue);
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
  }, [cameraOn, submit]);

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
      setCameraError("Nie udało się uruchomić kamery. Sprawdź zgodę albo użyj pola poniżej.");
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {cameraOn ? (
        <div className="border-line bg-surface overflow-hidden rounded-md border">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-video w-full bg-black object-cover"
          />
        </div>
      ) : null}

      {!cameraOn ? (
        <Button type="button" onClick={startCamera} disabled={!detectorSupported}>
          Włącz kamerę
        </Button>
      ) : (
        <p className="text-jade text-center font-mono text-xs tracking-widest uppercase">
          Kamera aktywna · pokaż kod z telefonu
        </p>
      )}

      {result ? (
        <div
          role="status"
          className={`rounded-md border p-3 text-center text-sm ${
            !result.ok
              ? "border-red/40 bg-red/5 text-red"
              : result.warn
                ? "border-amber/50 bg-amber/10 text-amber"
                : "border-jade/40 bg-jade/10 text-jade"
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-medium">{result.title}</p>
              <p className="mt-0.5 font-mono text-xs">{result.detail}</p>
            </>
          ) : (
            result.message
          )}
        </div>
      ) : null}

      {!detectorSupported ? (
        <p className="border-amber/40 bg-amber/5 text-amber rounded-md border p-2 text-xs">
          Ta przeglądarka nie obsługuje skanowania kamerą. Użyj czytnika QR wpisującego kod do pola
          poniżej albo otwórz kiosk w przeglądarce opartej na Chrome.
        </p>
      ) : null}
      {cameraError ? (
        <p className="border-red/40 bg-red/5 text-red rounded-md border p-2 text-xs">
          {cameraError}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (code) {
            setManual("");
            void submit(code);
          }
        }}
        className="flex gap-2"
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Kod z czytnika ręcznego"
          className="border-line bg-surface-2"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Odbij
        </Button>
      </form>
    </div>
  );
}
