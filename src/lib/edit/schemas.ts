// Edición automática (skill 13, modo "a cámara"): el plan que entrega la IA y las reglas que se revisan por código.
import { z } from "zod";

const str = z.string();
const n = z.coerce.number();

export const MAX_FINAL_SECONDS = 61;
export const CUT_MARGIN_S = 0.05;
export const MAX_ADJUSTMENTS = 3;

export const CUT_REASONS = ["saludo", "silencio", "muletilla", "toma_repetida", "tropiezo", "privado", "cola", "fuera_de_tema", "duracion"] as const;
export const CUT_LABEL: Record<(typeof CUT_REASONS)[number], string> = {
  saludo: "Saludo",
  silencio: "Pausa larga",
  muletilla: "Muletilla",
  toma_repetida: "Toma repetida",
  tropiezo: "Tropiezo",
  privado: "Dato privado",
  cola: "Final de más",
  fuera_de_tema: "Fuera de tema",
  duracion: "Para que quepa en 61 s",
};

/** Palabras con tiempos del transcriptor (tiempos del video original). */
export const wordsSchema = z.object({ palabras: z.array(z.object({ texto: str, inicio_s: n, fin_s: n })).default([]) });
export type Word = z.infer<typeof wordsSchema>["palabras"][number];

export const planSchema = z
  .object({
    skill_version: str.optional(),
    modo: str.default("a_camara"),
    duracion_original_s: n.default(0),
    duracion_final_s: n.default(0),
    cortes: z.array(z.object({ inicio_s: n, fin_s: n, motivo: z.enum(CUT_REASONS).catch("silencio"), texto: str.default("") }).passthrough()).default([]),
    subtitulos: z.object({ lineas: z.array(z.object({ inicio_s: n, fin_s: n, texto: str, resaltar: z.array(str).default([]), tramo: n.optional() }).passthrough()).default([]) }).passthrough().default({ lineas: [] }),
    zooms: z.array(z.object({ inicio_s: n, fin_s: n, tipo: z.enum(["acercamiento_suave", "golpe"]).catch("acercamiento_suave"), motivo: str.default(""), tramo: n.optional() }).passthrough()).default([]),
    textos_pantalla: z.array(z.object({ tipo: z.enum(["gancho", "seccion", "cta"]).catch("seccion"), inicio_s: n, fin_s: n, texto: str, estilo: str.default(""), tramo: n.optional() }).passthrough()).default([]),
    encuadres: z.array(z.object({ inicio_s: n, fin_s: n, plano: z.enum(["normal", "cercano", "muy_cercano"]).catch("normal"), tramo: n.optional() }).passthrough()).default([]),
    /** Solo en modo mixto: el orden final del video (tiempos del original; un tramo puede repetir un pedazo, el gancho prestado). */
    linea_de_tiempo: z.array(z.object({ tramo: n, tipo: z.enum(["gancho_prestado", "habla", "apoyo"]).catch("habla"), inicio_s: n, fin_s: n, audio: z.enum(["propio", "silencio"]).catch("propio"), que_se_ve: str.default("") }).passthrough()).default([]),
    /**
     * Solo en modo voz en off: qué toma se ve en cada momento de la voz. `inicio_s`/`fin_s` son tiempos de la voz (= del video final);
     * `desde_s`/`hasta_s` el pedazo de la toma `clip` (1, 2, 3… en el orden en que se subieron).
     */
    tramos_voz: z.array(z.object({ clip: n, desde_s: n, hasta_s: n, inicio_s: n, fin_s: n, que_se_ve: str.default(""), frase: str.default("") }).passthrough()).default([]),
    /** Solo en modo mixto: lo que se difumina o se corta por privacidad. */
    privacidad: z.array(z.object({ inicio_s: n, fin_s: n, accion: z.enum(["difuminar", "cortar"]).catch("difuminar"), porque: str.default("") }).passthrough()).default([]),
    portada: z.object({ segundo: n.default(0), porque: str.default(""), titulo: str.default(""), resaltar: str.default(""), elementos: z.array(str).default([]) }).passthrough().nullable().default(null),
    sugerencia_audio: str.default(""),
    resumen: z.array(str).default([]),
    botones: z.array(str).default([]),
    dudas_transcripcion: z.array(z.object({ segundo: n, escuche: str, propuesta: str }).passthrough()).default([]),
  })
  .passthrough();
export type Plan = z.infer<typeof planSchema>;

/** Qué cambió el creador sin llamar a la IA (nivel 1): cortes restaurados, textos editados y respuestas a las dudas. */
export const overridesSchema = z.object({
  restored: z.array(z.number().int().min(0)).default([]),
  /** Texto de un subtítulo cambiado a mano: { "3": "texto nuevo" } (índice de la línea). */
  subtitles: z.record(z.string(), z.string().max(200)).default({}),
  /** Texto de un título en pantalla cambiado a mano: { "0": "..." } */
  titles: z.record(z.string(), z.string().max(120)).default({}),
  /** Respuesta a cada duda: { "0": "propuesta" | "escuche" } */
  doubts: z.record(z.string(), z.enum(["propuesta", "escuche"])).default({}),
});
export type Overrides = z.infer<typeof overridesSchema>;
export const EMPTY_OVERRIDES: Overrides = { restored: [], subtitles: {}, titles: {}, doubts: {} };

/**
 * Reglas por código sobre el plan: tiempos dentro del video, cortes ordenados, sin planos que se traslapan y un solo plano
 * igual seguido de otro. La IA propone; el código evita que un número raro rompa el render.
 */
export const MIN_VO_SEGMENT_S = 0.6;

/**
 * Tramos de la voz en off: cubren la voz completa, en orden y sin huecos ni traslapes; cada uno apunta a una toma que existe
 * y a un pedazo que cabe dentro de ella. Si la toma dura menos que el tramo, se repite el último cuadro (lo hace el render).
 */
export function normalizeVoTramos(tramos: Plan["tramos_voz"], duration: number, clipSeconds: number[]): Plan["tramos_voz"] {
  const D = Math.max(0, duration);
  const nClips = clipSeconds.length;
  if (D <= 0 || nClips === 0) return [];
  const clamp = (t: number) => Math.min(D, Math.max(0, Number.isFinite(t) ? t : 0));
  const sorted = tramos
    .map((t) => ({ ...t, inicio_s: clamp(t.inicio_s), fin_s: clamp(t.fin_s) }))
    .filter((t) => t.fin_s - t.inicio_s >= MIN_VO_SEGMENT_S)
    .sort((a, b) => a.inicio_s - b.inicio_s);
  if (sorted.length === 0) return [];
  // Sin huecos ni traslapes: cada tramo arranca donde terminó el anterior; el último llega al final de la voz.
  const out: Plan["tramos_voz"] = [];
  let cursor = 0;
  sorted.forEach((t, i) => {
    const fin = i === sorted.length - 1 ? D : Math.max(t.fin_s, cursor + MIN_VO_SEGMENT_S);
    if (fin - cursor < MIN_VO_SEGMENT_S) return;
    const clipIdx = Math.min(nClips, Math.max(1, Math.round(Number.isFinite(t.clip) ? t.clip : 1)));
    const len = clipSeconds[clipIdx - 1]!;
    const need = fin - cursor;
    let desde = Math.min(Math.max(0, Number.isFinite(t.desde_s) ? t.desde_s : 0), Math.max(0, len - MIN_VO_SEGMENT_S));
    let hasta = Math.min(len, Math.max(desde + MIN_VO_SEGMENT_S, Number.isFinite(t.hasta_s) ? t.hasta_s : desde + need));
    if (hasta - desde > need) hasta = desde + need; // no se usa más de lo que dura el tramo
    if (hasta <= desde) {
      desde = 0;
      hasta = Math.min(len, need);
    }
    out.push({ ...t, clip: clipIdx, desde_s: desde, hasta_s: hasta, inicio_s: cursor, fin_s: fin });
    cursor = fin;
  });
  if (out.length > 0) out[out.length - 1] = { ...out[out.length - 1]!, fin_s: D };
  return out;
}

export function normalizePlan(p: Plan, duration: number, clipSeconds: number[] = []): Plan {
  const D = Math.max(0, duration);
  const clamp = (t: number) => Math.min(D, Math.max(0, Number.isFinite(t) ? t : 0));
  const span = <T extends { inicio_s: number; fin_s: number }>(x: T): T => ({ ...x, inicio_s: clamp(x.inicio_s), fin_s: clamp(x.fin_s) });
  const ok = <T extends { inicio_s: number; fin_s: number }>(x: T) => x.fin_s - x.inicio_s > 0.05;

  const cortes = p.cortes.map(span).filter(ok).sort((a, b) => a.inicio_s - b.inicio_s);
  // Los planos cubren el video en orden y sin traslapes; si repite el mismo plano seguido se junta con el anterior.
  const planos: Plan["encuadres"] = [];
  for (const e of p.encuadres.map(span).filter(ok).sort((a, b) => a.inicio_s - b.inicio_s)) {
    if (e.tramo !== undefined) {
      planos.push(e); // en modo mixto cada plano pertenece a su tramo
      continue;
    }
    const last = planos.at(-1);
    const start = last ? Math.max(e.inicio_s, last.fin_s) : e.inicio_s;
    if (e.fin_s - start <= 0.05) continue;
    if (last && last.plano === e.plano) planos[planos.length - 1] = { ...last, fin_s: e.fin_s };
    else planos.push({ ...e, inicio_s: start });
  }
  return {
    ...p,
    duracion_original_s: D,
    cortes,
    linea_de_tiempo: p.linea_de_tiempo.map(span).filter(ok).map((l, i) => ({ ...l, tramo: i + 1 })),
    privacidad: p.privacidad.map(span).filter(ok),
    tramos_voz: normalizeVoTramos(p.tramos_voz, D, clipSeconds),
    zooms: p.zooms.map(span).filter(ok).sort((a, b) => a.inicio_s - b.inicio_s),
    subtitulos: { ...p.subtitulos, lineas: p.subtitulos.lineas.map(span).filter((l) => ok(l) && l.texto.trim().length > 0).sort((a, b) => a.inicio_s - b.inicio_s) },
    textos_pantalla: p.textos_pantalla.map(span).filter((t) => ok(t) && t.texto.trim().length > 0),
    encuadres: planos,
    portada: p.portada ? { ...p.portada, segundo: clamp(p.portada.segundo) } : null,
    resumen: p.resumen.slice(0, 4),
  };
}
