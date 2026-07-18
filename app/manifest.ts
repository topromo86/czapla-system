import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Czapla Boxing",
    short_name: "Czapla Boxing",
    description: "System zarządzania klubem bokserskim Czapla Boxing - Mikołów i Tychy",
    start_url: "/",
    display: "standalone",
    background_color: "#12161a",
    theme_color: "#12161a",
    lang: "pl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
