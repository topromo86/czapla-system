import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "toFitCONTROL",
    short_name: "toFitCONTROL",
    description: "toFitCONTROL - system zarządzania klubem sportowym",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f6",
    theme_color: "#f4f5f6",
    lang: "pl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
