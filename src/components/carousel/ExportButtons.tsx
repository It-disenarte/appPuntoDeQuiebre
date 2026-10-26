"use client";

import { toPng } from "html-to-image";
import { zipSync } from "fflate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GeneratingCard } from "@/components/brujula/GeneratingCard";
import { Poller } from "@/components/metrics/Poller";
import { Button } from "@/components/ui";
import { buildPptx } from "./build-pptx";
import { H, SlideCanvas, W } from "./SlideCanvas";

type Item = Parameters<typeof SlideCanvas>[0];

/** Estado del video animado (reel) de este carrusel, que arma el servidor. */
export type AnimationInfo = {
  allowed: boolean;
  left: number;
  limit: number;
  status: "pendiente" | "renderizando" | "lista" | "error" | null;
  active: boolean;
  since: number;
  error: string;
  seconds: number | null;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "slide";

const dataUrlToBytes = (url: string) => Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

/** Exporta los slides a PNG de 1080 × 1350 desde el navegador (con las mismas tipografías de la vista previa). */
export function ExportButtons({ items, name, carouselId, animation }: { items: Item[]; name: string; carouselId?: string; animation?: AnimationInfo }) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function renderAll(): Promise<{ file: string; bytes: Uint8Array }[]> {
    await document.fonts.ready;
    const nodes = Array.from(stage.current?.children ?? []) as HTMLElement[];
    const out: { file: string; bytes: Uint8Array }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const opts = { width: W, height: H, pixelRatio: 1, cacheBust: true };
      await toPng(nodes[i]!, opts).catch(() => undefined); // la primera pasada precarga imágenes y tipografías (Safari)
      const url = await toPng(nodes[i]!, opts);
      out.push({ file: `${String(i + 1).padStart(2, "0")}_${slug(items[i]!.slide.titulo)}.png`, bytes: dataUrlToBytes(url) });
    }
    return out;
  }
  const save = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  async function run(kind: "zip" | "uno", index = 0) {
    setBusy(true);
    setError("");
    try {
      const files = await renderAll();
      if (kind === "zip") save(new Blob([zipSync(Object.fromEntries(files.map((f) => [f.file, f.bytes])), { level: 0 }) as BlobPart], { type: "application/zip" }), `${slug(name)}.zip`);
      else save(new Blob([files[index]!.bytes as BlobPart], { type: "image/png" }), files[index]!.file);
    } catch {
      setError("No pudimos crear las imágenes. Revisa que las fotos hayan cargado e intenta de nuevo.");
    }
    setBusy(false);
  }

  /** Manda los PNG al servidor (los dibuja este navegador con tus tipografías) y el video se arma en segundo plano. */
  async function makeVideo() {
    if (!carouselId) return;
    setBusy(true);
    setError("");
    try {
      const files = await renderAll();
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.file, f.bytes])), { level: 0 });
      const res = await fetch(`/api/carruseles/${carouselId}/animado`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: new Blob([zip as BlobPart], { type: "application/zip" }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "No pudimos enviar tu carrusel.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sin conexión. Intenta de nuevo con WiFi.");
    }
    setBusy(false);
  }

  async function canva() {
    setBusy(true);
    setError("");
    try {
      save(await buildPptx(items, name), `${slug(name)}.pptx`);
    } catch {
      setError("No pudimos crear el archivo editable. Intenta de nuevo.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => run("zip")} disabled={busy}>
          {busy ? "Creando imágenes…" : "Descargar todo (ZIP de PNG)"}
        </Button>
        <Button type="button" variant="outline" onClick={() => run("uno", 0)} disabled={busy}>
          Solo la portada
        </Button>
        <Button type="button" variant="outline" onClick={canva} disabled={busy}>
          Lo quiero en Canva (editable)
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}
      {animation && carouselId && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-ink-200 p-4">
          <div>
            <p className="font-extrabold">Video animado para reel</p>
            <p className="text-xs text-ink-600">Tu carrusel con movimiento suave y transiciones, en vertical (9:16) y sin audio: súbelo como reel y ponle la música que quieras.</p>
          </div>
          {!animation.allowed ? (
            <p role="status" className="rounded-lg bg-naranja-100 p-3 text-sm text-ink-900">
              El video animado es del <strong>plan Pro</strong>. Puedes subir de plan desde{" "}
              <Link href="/suscripcion" className="font-semibold underline underline-offset-4">
                Suscripción
              </Link>
              .
            </p>
          ) : animation.active ? (
            <>
              <Poller everyMs={3000} />
              <GeneratingCard since={animation.since} title="Armando tu video…" text="Estamos dándole movimiento a tus slides. Tarda un par de minutos." />
            </>
          ) : (
            <>
              {animation.status === "lista" && (
                <div className="flex flex-col gap-2">
                  <video controls playsInline preload="metadata" className="mx-auto aspect-[9/16] max-h-[70dvh] w-auto rounded-xl bg-negro" src={`/api/carruseles/${carouselId}/animado`}>
                    Tu navegador no puede reproducir este video.
                  </video>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/carruseles/${carouselId}/animado?descargar=1`} className="tap inline-flex items-center rounded-full bg-azul px-5 text-sm font-semibold text-blanco">
                      Descargar el video
                    </a>
                    {animation.seconds ? <span className="text-xs text-ink-500">Dura {animation.seconds} s. Se conserva 30 días: descárgalo antes.</span> : null}
                  </div>
                </div>
              )}
              {animation.status === "error" && (
                <p role="alert" className="rounded-xl bg-alerta-100 p-3 text-sm font-semibold text-alerta">
                  No pudimos armar el video: {animation.error || "algo falló."} Inténtalo de nuevo.
                </p>
              )}
              <Button type="button" variant={animation.status === "lista" ? "outline" : "primary"} onClick={makeVideo} disabled={busy} className="self-start">
                {busy ? "Preparando…" : animation.status === "lista" ? "Rehacer el video" : "Crear el video animado"}
              </Button>
              <p className="text-xs text-ink-500">
                {animation.left > 0 ? `Te quedan ${animation.left} de ${animation.limit} videos este mes.` : `Ya usaste tus ${animation.limit} videos de este mes. Rehacer el de un carrusel que ya tiene video no gasta otro.`} Antes de crearlo, revisa que tus imágenes ya estén puestas.
              </p>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-ink-500">Los PNG salen en 1080 × 1350 (4:5), listos para subir a Instagram en orden. “Lo quiero en Canva” baja un archivo PowerPoint con el texto editable: en Canva elige Crear un diseño → Importar archivo. Es una aproximación: revisa tipografías y detalles.</p>
      {/* Lienzos a tamaño real, fuera de la pantalla, solo para exportar. */}
      <div ref={stage} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        {items.map((p) => (
          <div key={p.slide.n} style={{ width: W, height: H }}>
            <SlideCanvas {...p} />
          </div>
        ))}
      </div>
    </div>
  );
}
