import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Punto de Quiebre",
    short_name: "Quiebre",
    description: "Tu marca personal, de “no sé qué grabar” a publicar con constancia y datos.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#191BDF",
    theme_color: "#191BDF",
    categories: ["productivity", "business", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoy", url: "/hoy" },
      { name: "Grabar", url: "/grabar" },
    ],
  };
}
