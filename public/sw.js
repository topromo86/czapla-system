const CACHE_NAME = "klub-bokserski-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Minimalna strategia na start (PLAN.md Faza 1): sieć w pierwszej kolejności,
// cache jako fallback offline. Tylko GET - mutacje (Server Actions, POST)
// nigdy nie są cache'owane ani przechwytywane.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// Powiadomienie "dziecko weszło na salę" (SPEC.md sekcja 3, PLAN.md Faza 4).
// Payload to zawsze JSON { title, body } - patrz lib/services/notify.ts.
self.addEventListener("push", (event) => {
  let data = { title: "Czapla Boxing", body: "Masz nowe powiadomienie." };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/app");
    }),
  );
});
