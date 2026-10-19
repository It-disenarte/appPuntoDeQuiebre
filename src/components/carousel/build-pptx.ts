"use client";

import { inkOn } from "@/lib/kit/contrast";
import { usesImage } from "@/lib/carousel/schemas";
import type { CanvasBg, CanvasKit } from "./SlideCanvas";
import type { Slide } from "@/lib/carousel/schemas";

type Item = { slide: Slide; kit: CanvasKit; bg: CanvasBg; imageUrl?: string | null; total: number };

const PX = 96; // 1 pulgada = 96 px: el lienzo de 1080 × 1350 px mide 11.25 × 14.0625 in
const inch = (px: number) => px / PX;
const pt = (px: number) => Math.round(px * 0.75);
const hex = (c: string) => c.replace("#", "").slice(0, 6).toUpperCase();

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Arma un PowerPoint (.pptx) con un slide por diapositiva, con el TEXTO EDITABLE y las fotos de fondo. Canva abre este archivo
 * y lo deja editable. Es una aproximación del diseño: respeta colores, tipografías (Canva sustituye las que no tenga) y el orden,
 * pero no los efectos finos (resaltador, íconos, destellos).
 */
export async function buildPptx(items: Item[], title: string): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "IG45", width: inch(1080), height: inch(1350) });
  pptx.layout = "IG45";
  pptx.title = title;

  for (const { slide: s, kit, bg, imageUrl } of items) {
    const slide = pptx.addSlide();
    const T = s.plantilla;
    const cover = T === "portada_impacto" || T === "portada_texto" || T === "portada_foto" || T === "cta";
    const photo = imageUrl && (usesImage(T) || s.imagen.fuente !== "ninguna") ? await toDataUrl(imageUrl) : null;
    const base = cover ? kit.fondoPortada : (bg.colores[0] ?? kit.fondo);
    slide.background = { color: hex(base) };
    if (photo) slide.addImage({ data: photo, x: 0, y: 0, w: inch(1080), h: inch(1350), sizing: { type: "cover", w: inch(1080), h: inch(1350) } });

    const onPhoto = Boolean(photo) && T !== "texto_foto";
    const ink = onPhoto || cover ? (cover ? kit.tituloPortada : "#FFFFFF") : inkOn(base);
    // Sobre foto se pone una franja oscura detrás del texto para que se lea al editarlo.
    const titleY = cover ? 120 : photo ? 760 : 380;
    if (onPhoto) slide.addShape("rect", { x: 0, y: inch(titleY - 40), w: inch(1080), h: inch(1350 - titleY + 40), fill: { color: "000000", transparency: 45 }, line: { color: "000000", transparency: 100 } });
    if (s.etiqueta) slide.addText(s.etiqueta, { x: inch(80), y: inch(titleY - 90), w: inch(500), h: inch(60), fontFace: kit.fuenteTexto, fontSize: pt(34), bold: true, color: hex(inkOn(kit.acento)), fill: { color: hex(kit.acento) }, align: "center", valign: "middle" });
    slide.addText(s.titulo, { x: inch(80), y: inch(titleY), w: inch(920), h: inch(cover ? 420 : 300), fontFace: kit.titulos, fontSize: pt(cover ? 104 : 80), bold: true, color: hex(ink), valign: "top", fit: "shrink" });
    if (s.cuerpo) slide.addText(s.cuerpo, { x: inch(80), y: inch(titleY + (cover ? 440 : 320)), w: inch(920), h: inch(300), fontFace: kit.fuenteTexto, fontSize: pt(40), color: hex(ink), valign: "top", fit: "shrink" });
    slide.addText(`${s.n}/${items.length}`, { x: inch(860), y: inch(1230), w: inch(140), h: inch(50), fontFace: kit.fuenteTexto, fontSize: pt(26), color: hex(ink), align: "right" });
    slide.addNotes(`Slide ${s.n}. Resaltar: ${s.resaltar ?? "—"}. Ícono sugerido: ${s.icono ?? "—"}.`);
  }
  const out = (await pptx.write({ outputType: "blob" })) as Blob;
  return out;
}
