"use client";

import { toPng } from "html-to-image";
import { zipSync } from "fflate";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { buildPptx } from "./build-pptx";
import { H, SlideCanvas, W } from "./SlideCanvas";

type Item = Parameters<typeof SlideCanvas>[0];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "slide";

const dataUrlToBytes = (url: string) => Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

/** Exporta los slides a PNG de 1080 × 1350 desde el navegador (con las mismas tipografías de la vista previa). */
export function ExportButtons({ items, name }: { items: Item[]; name: string }) {
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
