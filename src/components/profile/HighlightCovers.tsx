"use client";

import { toPng } from "html-to-image";
import { zipSync } from "fflate";
import { useRef, useState } from "react";
import { NamedIcon } from "@/components/carousel/SlideCanvas";
import { Scaled } from "@/components/Scaled";
import { Button } from "@/components/ui";
import type { Highlight } from "@/lib/profile/schemas";

const W = 1080;
const H = 1920;

/** Portada de una destacada: 1080 × 1920 con un círculo central de 740 px (la zona segura) y su aro. */
function Cover({ h, ring }: { h: Highlight; ring: string }) {
  const p = h.portada;
  return (
    <div style={{ width: W, height: H, background: p.fondo, display: "grid", placeItems: "center" }}>
      <div style={{ width: 740, height: 740, borderRadius: 370, display: "grid", placeItems: "center", border: `28px solid ${ring}` }}>
        <NamedIcon name={p.icono} size={380} color={p.color_icono} strokeWidth={1.6} />
      </div>
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "destacada";

export function HighlightCovers({ items, ring }: { items: Highlight[]; ring: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function render(i?: number) {
    setBusy(true);
    setError("");
    try {
      await document.fonts.ready;
      const nodes = Array.from(stage.current?.children ?? []) as HTMLElement[];
      const files: Record<string, Uint8Array> = {};
      for (let k = 0; k < nodes.length; k++) {
        if (i !== undefined && k !== i) continue;
        const url = await toPng(nodes[k]!, { width: W, height: H, pixelRatio: 1 });
        files[`${String(k + 1).padStart(2, "0")}_${slug(items[k]!.nombre)}.png`] = Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      }
      const entries = Object.entries(files);
      const blob = i !== undefined ? new Blob([entries[0]![1] as BlobPart], { type: "image/png" }) : new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = i !== undefined ? entries[0]![0] : "portadas-destacadas.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      setError("No pudimos crear las portadas. Intenta de nuevo.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((h, i) => (
          <div key={`${h.nombre}-${i}`} className="flex flex-col items-center gap-1 text-center">
            <Scaled w={W} h={H} className="relative w-full overflow-hidden rounded-xl">
              <Cover h={h} ring={ring} />
            </Scaled>
            <p className="text-xs font-semibold">{h.nombre}</p>
            <button type="button" onClick={() => render(i)} disabled={busy} className="text-xs font-semibold text-azul underline underline-offset-4">
              Descargar
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => render()} disabled={busy} className="self-start">
        {busy ? "Creando…" : "Descargar todas (ZIP)"}
      </Button>
      {error && <p className="text-sm text-alerta">{error}</p>}
      <details className="text-xs text-ink-600">
        <summary className="cursor-pointer font-semibold">Cómo ponerlas en Instagram</summary>
        <p className="mt-1">Abre la destacada → toca “Editar destacada” → “Editar portada” → elige la imagen de tu galería. El círculo central es lo que se ve; el aro ya va dibujado.</p>
      </details>
      <div ref={stage} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        {items.map((h, i) => (
          <div key={`${h.nombre}-${i}`} style={{ width: W, height: H }}>
            <Cover h={h} ring={ring} />
          </div>
        ))}
      </div>
    </div>
  );
}
