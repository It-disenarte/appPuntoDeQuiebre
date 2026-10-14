import type { Metadata } from "next";
import { cn, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Grabar" };

// Fase 0: vista previa del estudio. La cámara, el teleprompter y la subida llegan en la Fase 5 (Grabación).
const PARTS = ["Gancho", "Error 1", "Error 2 y 3", "Cierre"];

export default async function GrabarPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader dark eyebrow="Guion 2 de 4 · Jueves" title="3 errores al empezar un huerto" />

      <ol className="grid grid-cols-4 gap-1.5" aria-label="Partes del guion">
        {PARTS.map((p, i) => (
          <li key={p} className="flex flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", i === 0 ? "bg-naranja" : "bg-ink-700")} />
            <span className={cn("text-[0.6875rem]", i === 0 ? "font-extrabold text-naranja" : "text-ink-400")}>{p}</span>
          </li>
        ))}
      </ol>

      <div className="overflow-hidden rounded-card bg-ink-800">
        <p className="bg-negro/60 p-5 text-lg leading-snug font-extrabold">
          Si tus plantas se te mueren, probablemente estás cometiendo <span className="text-ink-500">uno de estos 3 errores…</span>
        </p>
        <div className="grid h-[28dvh] min-h-40 w-full place-items-center lg:h-80">
          <div className="aspect-[3/4] h-4/5 rounded-[50%] border-2 border-dashed border-ink-500" aria-hidden />
        </div>
        <p className="pb-4 text-center text-xs text-ink-400">Coloca tu cara dentro de la guía · Luz frente a ti</p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-400">Velocidad</span>
        <input type="range" min={1} max={5} defaultValue={3} className="flex-1 accent-blanco" aria-label="Velocidad del teleprompter" disabled />
        <span className="font-extrabold">Media</span>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" disabled className="h-11 rounded-full border border-ink-700 px-4 text-sm font-semibold text-ink-300">
          Repetir parte
        </button>
        <button
          type="button"
          disabled
          aria-label="Grabar"
          className="size-20 rounded-full border-4 border-blanco bg-naranja shadow-[0_0_0_4px_rgb(254_104_7/0.25)]"
        />
        <button type="button" disabled className="h-11 rounded-full bg-blanco px-5 text-sm font-semibold text-negro">
          Siguiente
        </button>
      </div>
      <p className="text-center text-xs text-ink-500">Vista previa · la grabación se activa en la Fase 5.</p>
    </div>
  );
}
