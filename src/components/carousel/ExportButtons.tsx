"use client";

import { getFontEmbedCSS, toPng } from "html-to-image";
import { zipSync } from "fflate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GeneratingCard } from "@/components/brujula/GeneratingCard";
import { Poller } from "@/components/metrics/Poller";
import { Button } from "@/components/ui";
import { BOXES_FILE, LAYER_CSS, LAYERS, PIECE_LAYERS, type Layer } from "@/lib/carousel/animate";
import { buildPptx } from "./build-pptx";
import { H, SlideCanvas, W } from "./SlideCanvas";
import { errorText } from "@/lib/net-error";

type Item = Parameters<typeof SlideCanvas>[0];

/** Estado de la animación de este carrusel (un clip por slide), que arma el servidor. */
export type AnimationInfo = {
  allowed: boolean;
  left: number;
  limit: number;
  status: "pendiente" | "renderizando" | "lista" | "error" | null;
  active: boolean;
  since: number;
  error: string;
  clips: { n: number; seconds: number; porque: string }[];
  hiloComun: string;
  ai: boolean;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "slide";

const dataUrlToBytes = (url: string) => Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

/** Dónde está cada pieza (ícono, título, texto, extras) dentro del slide, en píxeles del lienzo de 1080 × 1350: la IA y ffmpeg la usan para animar cada una. */
function pieceBoxes(node: HTMLElement): Record<string, { x: number; y: number; w: number; h: number }> {
  const root = node.getBoundingClientRect();
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const layer of PIECE_LAYERS) {
    const rects = Array.from(node.querySelectorAll(`[data-capa="${layer}"]`)).map((el) => el.getBoundingClientRect());
    if (rects.length === 0) continue;
    const x0 = Math.min(...rects.map((r) => r.left));
    const y0 = Math.min(...rects.map((r) => r.top));
    const x1 = Math.max(...rects.map((r) => r.right));
    const y1 = Math.max(...rects.map((r) => r.bottom));
    out[layer] = { x: x0 - root.left, y: y0 - root.top, w: x1 - x0, h: y1 - y0 };
  }
  return out;
}

/** Exporta los slides a PNG de 1080 × 1350 desde el navegador (con las mismas tipografías de la vista previa). */
export function ExportButtons({ items, name, carouselId, animation }: { items: Item[]; name: string; carouselId?: string; animation?: AnimationInfo }) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
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

  /** Una imagen por cada pieza de cada slide (fondo, ícono, título, texto, extras), con transparencia, para animarlas por separado. */
  async function renderLayers(): Promise<{ file: string; bytes: Uint8Array }[]> {
    await document.fonts.ready;
    const nodes = Array.from(stage.current?.children ?? []) as HTMLElement[];
    const out: { file: string; bytes: Uint8Array }[] = [];
    const boxes: Record<string, Record<string, { x: number; y: number; w: number; h: number }>> = {};
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      setProgress(`Preparando el slide ${i + 1} de ${nodes.length}…`);
      boxes[String(i + 1)] = pieceBoxes(node);
      const fontEmbedCSS = await getFontEmbedCSS(node).catch(() => undefined);
      const opts = { width: W, height: H, pixelRatio: 1, cacheBust: true, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) };
      const layers = LAYERS.filter((l) => l === "fondo" || node.querySelector(`[data-capa="${l}"]`)) as Layer[];
      for (const layer of layers) {
        node.setAttribute("data-pass", layer);
        try {
          if (layer === "fondo") await toPng(node, opts).catch(() => undefined); // precarga imágenes y tipografías (Safari)
          out.push({ file: `${String(i + 1).padStart(2, "0")}_${layer}.png`, bytes: dataUrlToBytes(await toPng(node, opts)) });
        } finally {
          node.removeAttribute("data-pass");
        }
      }
    }
    out.push({ file: BOXES_FILE, bytes: new TextEncoder().encode(JSON.stringify(boxes)) });
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

  /** Manda las capas al servidor (las dibuja este navegador con tus tipografías) y los clips se arman en segundo plano. */
  async function makeVideo() {
    if (!carouselId) return;
    setBusy(true);
    setError("");
    try {
      const files = await renderLayers();
      setProgress("Enviando tu carrusel…");
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.file, f.bytes])), { level: 0 });
      const res = await fetch(`/api/carruseles/${carouselId}/animado`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: new Blob([zip as BlobPart], { type: "application/zip" }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "No pudimos enviar tu carrusel.");
      }
      router.refresh();
    } catch (e) {
      setError(errorText(e, "Sin conexión. Intenta de nuevo con WiFi."));
    }
    setProgress("");
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
          {busy && !progress ? "Creando imágenes…" : "Descargar todo (ZIP de PNG)"}
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
            <p className="font-extrabold">Carrusel animado</p>
            <p className="text-xs text-ink-600">Una IA mira cada slide y decide qué animar y cómo (cómo entran las letras, el ícono o la imagen, qué hace el fondo). Cada slide queda como un video corto (4:5) para subirlos a Instagram en orden, como un carrusel con videos.</p>
          </div>
          {!animation.allowed ? (
            <p role="status" className="rounded-lg bg-naranja-100 p-3 text-sm text-ink-900">
              El carrusel animado es del <strong>plan Pro</strong>. Puedes subir de plan desde{" "}
              <Link href="/suscripcion" className="font-semibold underline underline-offset-4">
                Suscripción
              </Link>
              .
            </p>
          ) : animation.active ? (
            <>
              <Poller everyMs={3000} />
              <GeneratingCard since={animation.since} title="Animando tu carrusel…" text="Estamos dándole movimiento a cada slide. Tarda un par de minutos." />
            </>
          ) : (
            <>
              {animation.status === "lista" && animation.clips.length > 0 && (
                <div className="flex flex-col gap-3">
                  {animation.hiloComun && <p className="text-sm text-ink-700">{animation.ai ? "Así decidí animarlo: " : "Animación básica: "}{animation.hiloComun}</p>}
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {animation.clips.map((c) => (
                      <li key={c.n} className="flex flex-col gap-1.5">
                        <video controls playsInline muted loop preload="metadata" className="aspect-[4/5] w-full rounded-lg bg-negro" src={`/api/carruseles/${carouselId}/animado?n=${c.n}#t=2`}>
                          Tu navegador no puede reproducir este video.
                        </video>
                        {c.porque && <p className="text-xs text-ink-600">{c.porque}</p>}
                        <a href={`/api/carruseles/${carouselId}/animado?n=${c.n}&descargar=1`} className="text-xs font-semibold text-azul underline underline-offset-4">
                          Descargar el slide {c.n} · {c.seconds} s
                        </a>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/carruseles/${carouselId}/animado?descargar=1`} className="tap inline-flex items-center rounded-full bg-azul px-5 text-sm font-semibold text-blanco">
                      Descargar todos (ZIP)
                    </a>
                    <span className="text-xs text-ink-500">Se conservan 30 días: descárgalos antes.</span>
                  </div>
                </div>
              )}
              {animation.status === "error" && (
                <p role="alert" className="rounded-xl bg-alerta-100 p-3 text-sm font-semibold text-alerta">
                  No pudimos animar tu carrusel: {animation.error || "algo falló."} Inténtalo de nuevo.
                </p>
              )}
              <Button type="button" variant={animation.status === "lista" ? "outline" : "primary"} onClick={makeVideo} disabled={busy} className="self-start">
                {busy ? (progress || "Preparando…") : animation.status === "lista" ? "Volver a animar" : "Animar mi carrusel"}
              </Button>
              <p className="text-xs text-ink-500">
                {animation.left > 0 ? `Te quedan ${animation.left} de ${animation.limit} carruseles animados este mes.` : `Ya usaste tus ${animation.limit} carruseles animados de este mes. Volver a animar uno que ya tiene animación no gasta otro.`} Antes de animarlo, revisa que tus imágenes ya estén puestas.
              </p>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-ink-500">Los PNG salen en 1080 × 1350 (4:5), listos para subir a Instagram en orden. “Lo quiero en Canva” baja un archivo PowerPoint con el texto editable: en Canva elige Crear un diseño → Importar archivo. Es una aproximación: revisa tipografías y detalles.</p>
      <style>{LAYER_CSS}</style>
      {/* Lienzos a tamaño real, fuera de la pantalla, solo para exportar. */}
      <div ref={stage} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        {items.map((p) => (
          <div key={p.slide.n} className="cap-pass" style={{ width: W, height: H }}>
            <SlideCanvas {...p} />
          </div>
        ))}
      </div>
    </div>
  );
}
