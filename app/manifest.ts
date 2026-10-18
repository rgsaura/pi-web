import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const appName = process.env.PI_WEB_APP_NAME?.trim() || "Exohuman UI";
  return {
    id: "/",
    name: appName,
    short_name: appName,
    description: "Interfaz centralizada del sistema EXOHUMAN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    categories: ["developer", "productivity"],
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
