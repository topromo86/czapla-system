import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Klub Bokserski",
    short_name: "Klub Bokserski",
    description: "System zarządzania klubem bokserskim - Mikołów i Tychy",
    start_url: "/",
    display: "standalone",
    background_color: "#12161a",
    theme_color: "#12161a",
    lang: "pl",
    icons: [
      { src: "/pwa-icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
