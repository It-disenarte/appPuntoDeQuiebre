import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "Sin conexión" };

// Página estática que el service worker guarda para mostrarla cuando no hay red.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="pt-safe flex min-h-dvh flex-col items-center justify-center gap-8 bg-azul px-8 text-center text-blanco">
      <Logo surface="azul" className="w-48" />
      <div>
        <h1 className="font-display text-4xl">Sin conexión</h1>
        <p className="mt-3 max-w-xs text-azul-100">Revisa tu internet y vuelve a intentarlo. Tus guiones te esperan.</p>
      </div>
      <a href="/hoy" className="tap rounded-full bg-blanco px-6 py-3 font-semibold text-azul">
        Reintentar
      </a>
    </div>
  );
}
