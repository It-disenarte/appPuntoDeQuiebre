// Carrusel animado: cada slide se vuelve un clip corto (4:5, como el slide) con pequeñas animaciones. QUÉ se anima y CÓMO lo decide una IA
// que mira el slide (plan de animación); aquí está el catálogo cerrado de movimientos, la validación del plan y los argumentos de ffmpeg.
// Todo lo de aquí es puro (se prueba sin ffmpeg ni IA).
import { z } from "zod";

export const FPS = 30;
/** Los clips miden lo mismo que el slide (4:5), para subirlos a Instagram como carrusel con videos. */
export const CLIP_W = 1080;
export const CLIP_H = 1350;
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 12;
/** Cada capa es un PNG del tamaño del slide; el tope evita que se cuele un archivo enorme. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const MAX_ZIP_BYTES = 120 * 1024 * 1024;

/** Las piezas de un slide que se animan por separado. `fondo` es todo lo demás (color, foto, adornos). */
export const LAYERS = ["fondo", "icono", "titulo", "cuerpo", "extra"] as const;
export type Layer = (typeof LAYERS)[number];
export type PieceLayer = Exclude<Layer, "fondo">;
export const PIECE_LAYERS = LAYERS.filter((l): l is PieceLayer => l !== "fondo");

/**
 * Para sacar una capa (solo el título, solo el ícono…) en el navegador se oculta todo lo demás y el fondo del slide se vuelve transparente.
 * Las piezas del slide llevan `data-capa`; lo que no la lleva (fondo, fotos, adornos) es la capa "fondo". Se usa con `data-pass` en el contenedor.
 */
export const LAYER_CSS = `
.cap-pass[data-pass]:not([data-pass="fondo"]) * { visibility: hidden; }
.cap-pass[data-pass]:not([data-pass="fondo"]) > div { background: transparent !important; background-image: none !important; }
.cap-pass[data-pass="fondo"] [data-capa], .cap-pass[data-pass="fondo"] [data-capa] * { visibility: hidden; }
${PIECE_LAYERS.map((l) => `.cap-pass[data-pass="${l}"] [data-capa="${l}"], .cap-pass[data-pass="${l}"] [data-capa="${l}"] * { visibility: visible; }`).join(" ")}
`;

/** Nombre de cada capa dentro del ZIP: 01_fondo.png, 01_titulo.png, 02_fondo.png… Además va `cajas.json` con dónde está cada pieza. */
export const LAYER_FILE = /^(\d{2})_(fondo|icono|titulo|cuerpo|extra)\.png$/i;
export const BOXES_FILE = "cajas.json";

/* ───────────── Catálogo de movimientos (lo único que la IA puede elegir) ───────────── */

/** Cómo entra una pieza. `zoom` y `pulso` necesitan saber dónde está la pieza (su caja). */
export const ENTRADAS = ["aparecer", "subir", "bajar", "izquierda", "derecha", "rebote", "zoom", "revelar"] as const;
/** Qué hace la pieza después de entrar. */
export const BUCLES = ["ninguno", "flotar", "pulso"] as const;
/** Qué hace el fondo (y la foto, si la hay) durante todo el clip. */
export const FONDO_EFECTOS = ["respirar", "acercar", "alejar", "paneo_izquierda", "paneo_derecha", "quieto"] as const;
export const INTENSIDADES = ["suave", "media"] as const;
export type Entrada = (typeof ENTRADAS)[number];
export type Bucle = (typeof BUCLES)[number];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (lo: number, hi: number, fallback: number) => z.preprocess((v) => (v == null || v === "" ? undefined : Number(v)), z.number().catch(fallback).transform((n) => clamp(Number.isFinite(n) ? n : fallback, lo, hi)).default(fallback));
const text = z.preprocess((v) => (v == null ? "" : v), z.string());

const pieceSchema = z
  .object({
    entrada: z.enum(ENTRADAS).catch("subir"),
    retraso_s: num(0, 3.5, 0.4),
    duracion_s: num(0.3, 1.4, 0.6),
    bucle: z.enum(BUCLES).catch("ninguno"),
  })
  .passthrough();
export type PiecePlan = z.infer<typeof pieceSchema>;

export const clipPlanSchema = z
  .object({
    duracion_s: num(4, 8, 5),
    fondo: z.object({ efecto: z.enum(FONDO_EFECTOS).catch("respirar"), intensidad: z.enum(INTENSIDADES).catch("suave") }).passthrough().default({ efecto: "respirar", intensidad: "suave" }),
    capas: z.object({ icono: pieceSchema.optional(), titulo: pieceSchema.optional(), cuerpo: pieceSchema.optional(), extra: pieceSchema.optional() }).passthrough().default({}),
    porque: text.default(""),
  })
  .passthrough();
export type ClipPlan = z.infer<typeof clipPlanSchema>;

/** Lo que devuelve la skill de animación para todo el carrusel. */
export const animationPlanSchema = z
  .object({
    skill_version: text.optional(),
    hilo_comun: text.default(""),
    slides: z.array(clipPlanSchema.extend({ n: z.coerce.number().int() })).min(1),
  })
  .passthrough();

/* ───────────── Caja de cada pieza ───────────── */

export type Box = { x: number; y: number; w: number; h: number };
export type Boxes = Partial<Record<Layer, Box>>;

/** Deja una caja dentro del lienzo, en números pares (lo que pide ffmpeg) y con un margen para sombras y bordes. Devuelve null si no sirve. */
export function normalizeBox(raw: unknown, pad = 24): Box | null {
  const b = raw as Partial<Box> | null;
  if (!b || ![b.x, b.y, b.w, b.h].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const x0 = clamp(Math.floor(b.x! - pad), 0, CLIP_W - 2);
  const y0 = clamp(Math.floor(b.y! - pad), 0, CLIP_H - 2);
  const x1 = clamp(Math.ceil(b.x! + b.w! + pad), x0 + 2, CLIP_W);
  const y1 = clamp(Math.ceil(b.y! + b.h! + pad), y0 + 2, CLIP_H);
  const even = (n: number) => n - (n % 2);
  const w = even(x1 - x0);
  const h = even(y1 - y0);
  return w >= 2 && h >= 2 ? { x: even(x0), y: even(y0), w, h } : null;
}

/** Lee `cajas.json` ({ "1": { "titulo": {x,y,w,h} } }) y deja solo cajas válidas. */
export function parseBoxes(raw: unknown): Map<number, Boxes> {
  const out = new Map<number, Boxes>();
  if (!raw || typeof raw !== "object") return out;
  for (const [slide, layers] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(slide);
    if (!Number.isInteger(n) || !layers || typeof layers !== "object") continue;
    const boxes: Boxes = {};
    for (const l of PIECE_LAYERS) {
      const b = normalizeBox((layers as Record<string, unknown>)[l]);
      if (b) boxes[l] = b;
    }
    out.set(n, boxes);
  }
  return out;
}

/* ───────────── Tiempos y plan por defecto ───────────── */

/** Cuántos segundos dura el clip de un slide: lo que tarda en leerse con un mínimo y un máximo. */
export function slideSeconds(texts: string[]): number {
  const words = texts.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(6, Math.max(4, 3.5 + words / 6)) * 10) / 10;
}

/** Los textos de un slide que cuentan para el tiempo de lectura. */
export function slideTexts(slide: { titulo?: string; cuerpo?: string | null; dato?: string | null; etiqueta?: string | null }): string[] {
  return [slide.titulo, slide.cuerpo, slide.dato, slide.etiqueta].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Cuándo entra cada pieza (segundos) en el plan por defecto: una tras otra, con el ícono primero. */
export function entryTimes(has: Partial<Record<Layer, boolean>>): Partial<Record<Layer, number>> {
  const out: Partial<Record<Layer, number>> = {};
  let t = 0.25;
  if (has.icono) {
    out.icono = t;
    t += 0.45;
  }
  if (has.titulo) {
    out.titulo = t;
    t += 0.65;
  }
  if (has.cuerpo) {
    out.cuerpo = t;
    t += 0.6;
  }
  if (has.extra) out.extra = Math.max(t, 0.9);
  return out;
}

/** El plan de siempre (sirve cuando no hay IA o su respuesta no sirvió): el fondo respira y las piezas entran una tras otra. */
export function defaultPlan(present: Partial<Record<Layer, boolean>>, seconds: number): ClipPlan {
  const t = entryTimes(present);
  const capas: ClipPlan["capas"] = {};
  if (present.icono) capas.icono = { entrada: "rebote", retraso_s: t.icono!, duracion_s: 0.9, bucle: "ninguno" };
  if (present.titulo) capas.titulo = { entrada: "subir", retraso_s: t.titulo!, duracion_s: 0.6, bucle: "ninguno" };
  if (present.cuerpo) capas.cuerpo = { entrada: "subir", retraso_s: t.cuerpo!, duracion_s: 0.6, bucle: "ninguno" };
  if (present.extra) capas.extra = { entrada: "aparecer", retraso_s: t.extra!, duracion_s: 0.6, bucle: "ninguno" };
  return { duracion_s: seconds, fondo: { efecto: "respirar", intensidad: "media" }, capas, porque: "" };
}

/**
 * Deja un plan de la IA en algo seguro: solo las piezas que existen, sin movimientos que pidan una caja que no hay, y con todo el movimiento
 * terminado antes del final del clip (para que se alcance a leer).
 */
export function sanitizePlan(plan: ClipPlan, present: Partial<Record<Layer, boolean>>, boxes: Boxes = {}): ClipPlan {
  const duracion = clamp(plan.duracion_s, 4, 8);
  const capas: ClipPlan["capas"] = {};
  for (const l of PIECE_LAYERS) {
    const p = plan.capas[l];
    if (!present[l]) continue;
    const base = p ?? defaultPlan(present, duracion).capas[l]!;
    const hasBox = Boolean(boxes[l]);
    const entrada: Entrada = !hasBox && base.entrada === "zoom" ? "aparecer" : base.entrada;
    const bucle: Bucle = !hasBox && base.bucle === "pulso" ? "ninguno" : base.bucle;
    const retraso = clamp(base.retraso_s, 0, Math.max(0, duracion - 1.5));
    const dur = clamp(base.duracion_s, 0.3, Math.max(0.3, duracion - retraso - 0.8));
    capas[l] = { ...base, entrada, bucle, retraso_s: Math.round(retraso * 100) / 100, duracion_s: Math.round(dur * 100) / 100 };
  }
  return { ...plan, duracion_s: duracion, capas };
}

/* ───────────── ffmpeg ───────────── */

export type ClipOptions = {
  /** Ruta del PNG de cada capa (solo `fondo` es obligatoria; las demás solo si el slide tiene esa pieza). */
  layers: Partial<Record<Layer, string>>;
  /** Dónde está cada pieza dentro del slide (hace falta para `zoom` y `pulso`, y acelera el trabajo). */
  boxes?: Boxes;
  plan: ClipPlan;
  output: string;
};

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/** Expresiones de ffmpeg para el fondo: escala (acercamiento) y desplazamiento del recorte. */
function backgroundFilter(plan: ClipPlan): string {
  const d = f(plan.duracion_s);
  const k = plan.fondo.intensidad === "media" ? 1 : 0.6;
  const W = CLIP_W;
  const H = CLIP_H;
  const wrap = (scale: string, x = "(iw-ow)/2", y = "(ih-oh)/2") => `scale=w='trunc(${W}*(${scale})/2)*2':h=-2:eval=frame:flags=bicubic,crop=${W}:${H}:x='${x}':y='${y}'`;
  switch (plan.fondo.efecto) {
    case "quieto":
      return `scale=${W}:${H}`;
    case "acercar":
      return wrap(`1+${f(0.1 * k)}*t/${d}`);
    case "alejar":
      return wrap(`${f(1 + 0.1 * k)}-${f(0.1 * k)}*t/${d}`);
    case "paneo_izquierda":
      return wrap(`${f(1 + 0.12 * k)}`, `(iw-ow)*(1-t/${d})`);
    case "paneo_derecha":
      return wrap(`${f(1 + 0.12 * k)}`, `(iw-ow)*t/${d}`);
    default:
      return wrap(`1+${f(0.04 * k)}*sin(PI*t/${d})`);
  }
}

/** Cadena de filtros de una pieza: recorte, entrada, y su posición por fotograma. Devuelve el sprite y las expresiones de su posición. */
function pieceFilters(idx: number, layer: PieceLayer, p: PiecePlan, box: Box): { chain: string; x: string; y: string } {
  const t0 = f(p.retraso_s);
  const dur = f(p.duracion_s);
  const after = f(p.retraso_s + p.duracion_s);
  const u = `clip((t-${t0})/${dur},0,1)`;
  const up = `max(0,t-${t0})`;
  const filters: string[] = [`format=rgba`, `crop=${box.w}:${box.h}:${box.x}:${box.y}`];

  let dx = "0";
  let dy = "0";
  let scale = "1";
  switch (p.entrada) {
    case "subir":
      dy = `60*pow(1-${u},3)`;
      break;
    case "bajar":
      dy = `-60*pow(1-${u},3)`;
      break;
    case "izquierda":
      dx = `-140*pow(1-${u},3)`;
      break;
    case "derecha":
      dx = `140*pow(1-${u},3)`;
      break;
    case "rebote":
      dy = `70*exp(-5*${up})*cos(14*${up})`;
      break;
    case "zoom":
      scale = `(1-0.45*exp(-6*${up})*cos(9*${up}))`;
      break;
    default:
      break;
  }
  if (p.bucle === "flotar") dy = `(${dy})+9*sin(2*PI*max(0,t-${after})/2.6)`;
  if (p.bucle === "pulso") scale = `(${scale})*(1+0.035*sin(2*PI*max(0,t-${after})/1.8))`;

  if (p.entrada === "revelar") {
    // De izquierda a derecha, con un borde suave: se recorta el alfa de la propia pieza (sin tocar sus colores).
    // (En geq el tiempo se llama T, con mayúscula.)
    filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip((W*clip((T-${t0})/${dur},0,1)-X)/48,0,1)'`);
  } else {
    const fade = Math.min(p.duracion_s, p.entrada === "zoom" || p.entrada === "rebote" ? 0.3 : 0.5);
    filters.push(`fade=t=in:st=${t0}:d=${f(fade)}:alpha=1`);
  }
  if (scale !== "1") filters.push(`scale=w='max(2,trunc(${box.w}*(${scale})/2)*2)':h='max(2,trunc(${box.h}*(${scale})/2)*2)':eval=frame`);

  // Con acercamiento la pieza crece desde su centro; sin él, queda en su lugar.
  const x = scale !== "1" ? `${box.x + box.w / 2}-overlay_w/2+(${dx})` : `${box.x}+(${dx})`;
  const y = scale !== "1" ? `${box.y + box.h / 2}-overlay_h/2+(${dy})` : `${box.y}+(${dy})`;
  return { chain: `[${idx}:v]${filters.join(",")}[s${idx}]`, x, y };
}

/**
 * Argumentos de ffmpeg para un clip según su plan de animación. El fondo se mueve como pide el plan y cada pieza entra a su manera
 * (`entrada`) y después se queda quieta o flota/pulsa (`bucle`). Sin audio. MP4 H.264 listo para Instagram.
 */
export function clipArgs(o: ClipOptions): string[] {
  if (!o.layers.fondo) throw new Error("Falta la capa de fondo");
  const d = o.plan.duracion_s;
  if (!(d >= 2 && d <= 12)) throw new Error("La duración del clip no es válida");
  const present = LAYERS.filter((l) => o.layers[l]);
  const full: Box = { x: 0, y: 0, w: CLIP_W, h: CLIP_H };

  const inputs = present.flatMap((l) => ["-loop", "1", "-framerate", String(FPS), "-t", f(d), "-i", o.layers[l]!]);
  const graph: string[] = [`[0:v]${backgroundFilter(o.plan)},setsar=1,format=yuv420p[b0]`];

  let last = "b0";
  present.slice(1).forEach((layer, k) => {
    const idx = k + 1;
    const piece = layer as PieceLayer;
    const p = o.plan.capas[piece] ?? defaultPlan({ [piece]: true }, d).capas[piece]!;
    const { chain, x, y } = pieceFilters(idx, piece, p, o.boxes?.[piece] ?? full);
    graph.push(chain);
    graph.push(`[${last}][s${idx}]overlay=x='${x}':y='${y}':format=auto[o${idx}]`);
    last = `o${idx}`;
  });
  graph.push(`[${last}]format=yuv420p[v]`);

  return ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph.join(";"), "-map", "[v]", "-t", f(d), "-an", "-threads", "2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", o.output];
}

/** Un PNG de verdad (y no cualquier archivo con extensión .png). */
export const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
/** Un ZIP de verdad (firma "PK"). */
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);

/** Agrupa los archivos del ZIP por slide: { 1: { fondo, titulo… }, 2: … }. Ignora lo que no tenga el nombre esperado. */
export function groupLayers<T>(files: Record<string, T>): Map<number, Partial<Record<Layer, T>>> {
  const out = new Map<number, Partial<Record<Layer, T>>>();
  for (const [name, data] of Object.entries(files)) {
    const m = LAYER_FILE.exec(name);
    if (!m) continue;
    const n = Number(m[1]);
    out.set(n, { ...(out.get(n) ?? {}), [m[2]!.toLowerCase() as Layer]: data });
  }
  return out;
}
