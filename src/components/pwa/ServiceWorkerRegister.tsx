"use client";

import { useEffect } from "react";

/** Registra el service worker en producción. En desarrollo se omite para no interferir con el recargado. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("No se pudo registrar el service worker", err);
    });
  }, []);
  return null;
}
