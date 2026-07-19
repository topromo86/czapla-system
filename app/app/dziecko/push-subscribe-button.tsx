"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { clearPushSubscriptionAction, savePushSubscriptionAction } from "./actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Włączenie/wyłączenie Web Push na tym urządzeniu - jedyne miejsce w
// aplikacji, gdzie potrzebujemy prawdziwego kodu klienckiego (Notification /
// PushManager to API przeglądarki, nie da się tego zrobić server-side).
export function PushSubscribeButton({ isSubscribed }: { isSubscribed: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setError(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("Ta przeglądarka nie obsługuje powiadomień push.");
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setError("Powiadomienia push nie są skonfigurowane po stronie serwera.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Brak zgody na powiadomienia w przeglądarce.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
      startTransition(() => {
        void savePushSubscriptionAction(JSON.stringify(subscription));
      });
    } catch {
      setError("Nie udało się włączyć powiadomień.");
    }
  }

  async function unsubscribe() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      startTransition(() => {
        void clearPushSubscriptionAction();
      });
    } catch {
      setError("Nie udało się wyłączyć powiadomień.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {isSubscribed ? (
        <Button type="button" variant="outline" size="sm" onClick={unsubscribe} disabled={pending}>
          Wyłącz powiadomienia push na tym urządzeniu
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={subscribe} disabled={pending}>
          Włącz powiadomienia push na tym urządzeniu
        </Button>
      )}
      {error ? <p className="text-red text-xs">{error}</p> : null}
    </div>
  );
}
