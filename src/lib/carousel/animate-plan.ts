import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { claudeConfigured } from "@/lib/ai/claude";
import { logCall } from "@/lib/edit/service";
import { recordError } from "@/lib/errors";
import { visionJson } from "@/lib/skills";
import { animationPlanSchema, defaultPlan, LAYERS, PIECE_LAYERS, sanitizePlan, slideSeconds, slideTexts, type Boxes, type ClipPlan, type Layer } from "./animate";
import type { CarruselOut } from "./schemas";

/** Lo que se le cuenta a la IA de cada slide (además de su imagen). */
export type SlideInfo = { n: number; present: Partial<Record<Layer, boolean>>; boxes: Boxes; hasPhoto: boolean };
export type PlanResult = { plans: Map<number, ClipPlan>; hiloComun: string; ai: boolean };

const PREVIEW_W = 540;

/** El slide terminado (todas sus capas encimadas) en una imagen chica, para que la IA lo vea. */
export async function previewOf(layers: Partial<Record<Layer, Uint8Array>>): Promise<Buffer> {
  const base = sharp(Buffer.from(layers.fondo!));
  const over = LAYERS.filter((l) => l !== "fondo" && layers[l]).map((l) => ({ input: Buffer.from(layers[l]!) }));
  return (over.length ? base.composite(over) : base).resize({ width: PREVIEW_W }).jpeg({ quality: 70 }).toBuffer();
}

/** El plan de siempre para todos los slides (sin IA). */
export function defaultPlans(content: CarruselOut, slides: SlideInfo[]): Map<number, ClipPlan> {
  const out = new Map<number, ClipPlan>();
  for (const s of slides) out.set(s.n, sanitizePlan(defaultPlan(s.present, slideSeconds(slideTexts(content.slides[s.n - 1] ?? {}))), s.present, s.boxes));
  return out;
}

/**
 * Le pide a la IA que mire los slides y decida qué animar y cómo. Si no hay IA o su respuesta no sirve, usa el plan de siempre:
 * nunca se queda sin animar por esto.
 */
export async function planAnimations(userId: string, content: CarruselOut, slides: SlideInfo[], previews: Buffer[]): Promise<PlanResult> {
  const fallback = (): PlanResult => ({ plans: defaultPlans(content, slides), hiloComun: "", ai: false });
  if (!claudeConfigured()) return fallback();
  try {
    const system = await readFile(path.join(process.cwd(), "skills", "animacion-carrusel", "v1", "skill.md"), "utf8");
    const input = {
      carrusel: { titulo: content.titulo, tipo: content.tipo, estilo: content.estilo_detectado ?? null, hilo_comun: content.animacion?.hilo_comun ?? null, porque_animacion: content.animacion?.porque ?? null },
      slides: slides.map((s) => {
        const sl = content.slides[s.n - 1];
        return {
          n: s.n,
          plantilla: sl?.plantilla ?? "texto",
          rol: sl?.rol ?? "punto",
          titulo: sl?.titulo ?? "",
          cuerpo: sl?.cuerpo ?? null,
          resaltar: sl?.resaltar ?? null,
          icono: sl?.icono ?? null,
          dato: sl?.dato ?? null,
          etiqueta: sl?.etiqueta ?? null,
          pistas_de_movimiento: sl?.movimiento ?? [],
          capas: PIECE_LAYERS.filter((l) => s.present[l]),
          tiene_foto: s.hasPhoto,
          segundos_de_lectura: slideSeconds(slideTexts(sl ?? {})),
        };
      }),
    };
    const r = await visionJson(system, `Entrada:\n${JSON.stringify(input)}\n\nLas imágenes son los slides, en el mismo orden de la lista. Responde solo con el JSON de salida.`, previews, "animacion-carrusel");
    const parsed = animationPlanSchema.safeParse(r.json);
    if (!parsed.success) throw new Error("La salida no cumple el esquema: " + parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; "));
    await logCall(userId, "animacion-carrusel", false, "ok", { i: r.inputTokens, o: r.outputTokens });

    const byN = new Map(parsed.data.slides.map((s) => [s.n, s]));
    const plans = new Map<number, ClipPlan>();
    for (const s of slides) {
      const mine = byN.get(s.n);
      const reading = slideSeconds(slideTexts(content.slides[s.n - 1] ?? {}));
      plans.set(s.n, mine ? sanitizePlan({ ...mine, duracion_s: Math.max(mine.duracion_s, reading) }, s.present, s.boxes) : sanitizePlan(defaultPlan(s.present, reading), s.present, s.boxes));
    }
    return { plans, hiloComun: parsed.data.hilo_comun, ai: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "falló";
    console.error("[carrusel-animado] el plan de animación con IA falló, se usa el de siempre:", message);
    await logCall(userId, "animacion-carrusel", false, "error");
    await recordError({ source: "ia", message: `animacion-carrusel: ${message}` });
    return fallback();
  }
}

