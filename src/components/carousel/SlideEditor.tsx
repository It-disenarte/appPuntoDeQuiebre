"use client";

import { ArrowDown, ArrowUp, Copy, ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Button, Field, FormError, SelectField, TextAreaField } from "@/components/ui";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { editSlideAction, generateImageAction, moveSlideAction, removeImageAction, rewriteSlideAction, setFocalAction, type CarouselActionState } from "@/lib/carousel/actions";
import { TEMPLATE_LABEL, TEMPLATES, usesImage, type Slide } from "@/lib/carousel/schemas";
import { submitKeepingState } from "@/lib/form-submit";
import { ScaledSlide } from "./ScaledSlide";
import type { CanvasBg, CanvasKit } from "./SlideCanvas";
import { errorText } from "@/lib/net-error";

type Props = {
  carouselId: string;
  slide: Slide;
  total: number;
  kit: CanvasKit;
  bg: CanvasBg;
  handle?: string;
  image: { url: string; x: number; y: number } | null;
  attemptsLeft: number;
  /** Crear la imagen con IA desde aquí (si la llave de Gemini está y le quedan imágenes este mes). */
  aiImages?: { enabled: boolean; left: number };
};

const TEMPLATE_OPTIONS = Object.fromEntries(TEMPLATES.map((t) => [t, TEMPLATE_LABEL[t]]));

export function SlideEditor({ carouselId, slide, total, kit, bg, handle, image, attemptsLeft, aiImages }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [edit, editAction, editPending] = useActionState<CarouselActionState, FormData>(editSlideAction, undefined);
  const [redo, redoAction, redoPending] = useActionState<CarouselActionState, FormData>(rewriteSlideAction, undefined);
  const [gen, genAction, genPending] = useActionState<CarouselActionState, FormData>(generateImageAction, undefined);
  const [focalState, focalAction, focalPending] = useActionState<CarouselActionState, FormData>(setFocalAction, undefined);
  const [busy, setBusy] = useState(false);
  const [upError, setUpError] = useState("");
  const [focal, setFocal] = useState({ x: image?.x ?? 50, y: image?.y ?? 50 });
  const [copied, setCopied] = useState(false);
  const wantsImage = slide.imagen.fuente !== "ninguna" || usesImage(slide.plantilla);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setUpError("");
    try {
      const res = await fetch(`/api/carruseles/${carouselId}/imagen?n=${slide.n}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
    } catch (e) {
      setUpError(errorText(e, "No se pudo subir la imagen."));
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const guide = slide.imagen.foto_guia;
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-card bg-blanco p-4 shadow-card md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]" aria-label={`Slide ${slide.n}`}>
      <div className="flex min-w-0 flex-col gap-2">
        <ScaledSlide slide={slide} kit={kit} bg={bg} imageUrl={image?.url ?? null} focal={focal} total={total} handle={handle} />
        <div className="flex items-center justify-between text-xs text-ink-500">
          <span>
            Slide {slide.n} de {total}
          </span>
          <div className="flex gap-1">
            {(["up", "down"] as const).map((dir) => (
              <form key={dir} action={moveSlideAction}>
                <input type="hidden" name="id" value={carouselId} />
                <input type="hidden" name="n" value={slide.n} />
                <input type="hidden" name="dir" value={dir} />
                <button type="submit" disabled={dir === "up" ? slide.n <= 2 : slide.n >= total} aria-label={dir === "up" ? "Subir de lugar" : "Bajar de lugar"} className="tap grid size-9 place-items-center rounded-full border border-ink-300 disabled:opacity-30">
                  {dir === "up" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <form onSubmit={submitKeepingState(editAction)} className="flex flex-col gap-3">
          <FormError message={edit?.error} />
          <input type="hidden" name="id" value={carouselId} />
          <input type="hidden" name="n" value={slide.n} />
          <Field label="Título" id={`titulo-${slide.n}`} name="titulo" defaultValue={slide.titulo} maxLength={90} required />
          <TextAreaField label="Texto" id={`cuerpo-${slide.n}`} name="cuerpo" defaultValue={slide.cuerpo ?? ""} rows={2} maxLength={260} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Palabra a resaltar" id={`resaltar-${slide.n}`} name="resaltar" defaultValue={slide.resaltar ?? ""} maxLength={40} />
            <SelectField label="Diseño" id={`plantilla-${slide.n}`} name="plantilla" defaultValue={slide.plantilla} options={TEMPLATE_OPTIONS} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={editPending}>
              {editPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {edit?.ok && <span className="text-xs text-exito">Guardado</span>}
          </div>
        </form>

        {wantsImage && (
          <div className="flex flex-col gap-3 rounded-xl bg-ink-100 p-3">
            <p className="text-sm font-extrabold">{slide.imagen.fuente === "ia" ? "Imagen creada con IA" : "Tu foto"}</p>
            {slide.imagen.fuente === "ia" && slide.imagen.prompt_ia && (
              <div className="flex flex-col gap-2">
                <p className="text-xs whitespace-pre-line text-ink-700">{slide.imagen.prompt_ia}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(slide.imagen.prompt_ia!)} className="self-start">
                  <Copy className="size-4" aria-hidden /> {copied ? "Copiado" : "Copiar prompt"}
                </Button>
                {aiImages?.enabled && (
                  <form action={genAction} className="flex flex-col gap-1">
                    {genPending && <LoadingOverlay title="Pidiendo tu imagen…" hint="Un momento." />}
                    <input type="hidden" name="id" value={carouselId} />
                    <input type="hidden" name="n" value={slide.n} />
                    <Button type="submit" size="sm" disabled={genPending || aiImages.left <= 0} className="self-start">
                      {image ? "Crear otra con IA" : "Crear la imagen con IA"}
                    </Button>
                    <span className="text-xs text-ink-500">{aiImages.left > 0 ? `Te quedan ${aiImages.left} imágenes con IA este mes.` : "No te quedan imágenes con IA este mes: sube una foto."}</span>
                    {gen?.error && (
                      <span role="alert" className="text-xs text-alerta">
                        {gen.error}
                      </span>
                    )}
                  </form>
                )}
              </div>
            )}
            {guide && (
              <ul className="list-disc pl-5 text-xs text-ink-700">
                <li>
                  <strong>Qué foto:</strong> {guide.que_foto}
                </li>
                <li>
                  <strong>Cómo tomarla:</strong> {guide.como_tomarla}
                </li>
                <li>
                  <strong>Si no la tienes:</strong> {guide.alternativa}
                </li>
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="tap inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-300 bg-blanco px-4 text-sm font-semibold">
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
                <ImagePlus className="size-4" aria-hidden /> {busy ? "Subiendo…" : image ? "Cambiar imagen" : "Subir imagen"}
              </label>
              {image && (
                <form action={removeImageAction}>
                  <input type="hidden" name="id" value={carouselId} />
                  <input type="hidden" name="n" value={slide.n} />
                  <Button type="submit" variant="ghost" size="sm">
                    Quitar
                  </Button>
                </form>
              )}
            </div>
            {upError && (
              <p role="alert" className="text-xs text-alerta">
                {upError}
              </p>
            )}
            {image && (
              <form onSubmit={submitKeepingState(focalAction)} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={carouselId} />
                <input type="hidden" name="n" value={slide.n} />
                <input type="hidden" name="x" value={focal.x} />
                <input type="hidden" name="y" value={focal.y} />
                <label className="flex items-center gap-2 text-xs">
                  Izquierda – derecha
                  <input type="range" min={0} max={100} value={focal.x} onChange={(e) => setFocal((f) => ({ ...f, x: Number(e.target.value) }))} className="flex-1" />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  Arriba – abajo
                  <input type="range" min={0} max={100} value={focal.y} onChange={(e) => setFocal((f) => ({ ...f, y: Number(e.target.value) }))} className="flex-1" />
                </label>
                <Button type="submit" variant="outline" size="sm" disabled={focalPending} className="self-start">
                  Guardar encuadre
                </Button>
                {focalState?.error && <p className="text-xs text-alerta">{focalState.error}</p>}
              </form>
            )}
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-semibold text-azul">No me gusta este slide ({attemptsLeft} {attemptsLeft === 1 ? "intento" : "intentos"})</summary>
          <form onSubmit={submitKeepingState(redoAction)} className="mt-2 flex flex-col gap-2">
            <FormError message={redo?.error} />
            <input type="hidden" name="id" value={carouselId} />
            <input type="hidden" name="n" value={slide.n} />
            <TextAreaField label="¿Qué cambiarías?" id={`nota-${slide.n}`} name="nota" rows={2} maxLength={300} required />
            <Button type="submit" variant="outline" size="sm" disabled={redoPending || attemptsLeft <= 0} className="self-start">
              {redoPending ? "Rehaciendo…" : "Rehacer este slide"}
            </Button>
          </form>
        </details>
      </div>
    </section>
  );
}

