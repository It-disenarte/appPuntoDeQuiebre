// Carrusel animado: cada slide se vuelve un clip corto (4:5, como el slide) con pequeñas animaciones: el fondo "respira" y el ícono, el
// título, el texto y los extras entran uno tras otro. Todo lo de aquí es puro (se prueba sin ffmpeg).

export const FPS = 30;
/** Los clips miden lo mismo que el slide (4:5), para subirlos a Instagram como carrusel con videos. */
export const CLIP_W = 1080;
export const CLIP_H = 1350;
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 12;
/** Cada capa es un PNG del tamaño del slide; el tope evita que se cuele un archivo enorme. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const MAX_ZIP_BYTES = 120 * 1024 * 1024;

/** Las piezas de un slide que se animan por separado. `fondo` es todo lo demás y no se anima más que respirando. */
export const LAYERS = ["fondo", "icono", "titulo", "cuerpo", "extra"] as const;
export type Layer = (typeof LAYERS)[number];
/**
 * Para sacar una capa (solo el título, solo el ícono…) en el navegador se oculta todo lo demás y el fondo del slide se vuelve transparente.
 * Las piezas del slide llevan `data-capa`; lo que no la lleva (fondo, fotos, adornos) es la capa "fondo". Se usa con `data-pass` en el contenedor.
 */
export const LAYER_CSS = `
.cap-pass[data-pass]:not([data-pass="fondo"]) * { visibility: hidden; }
.cap-pass[data-pass]:not([data-pass="fondo"]) > div { background: transparent !important; background-image: none !important; }
.cap-pass[data-pass="fondo"] [data-capa], .cap-pass[data-pass="fondo"] [data-capa] * { visibility: hidden; }
${LAYERS.filter((l) => l !== "fondo")
  .map((l) => `.cap-pass[data-pass="${l}"] [data-capa="${l}"], .cap-pass[data-pass="${l}"] [data-capa="${l}"] * { visibility: visible; }`)
  .join(" ")}
`;

/** Nombre de cada capa dentro del ZIP: 01_fondo.png, 01_titulo.png, 02_fondo.png… */
export const LAYER_FILE = /^(\d{2})_(fondo|icono|titulo|cuerpo|extra)\.png$/i;

/** Cuántos segundos dura el clip de un slide: lo que tarda en leerse con un mínimo y un máximo (el de tu ejemplo dura 5). */
export function slideSeconds(texts: string[]): number {
  const words = texts.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(6, Math.max(4, 3.5 + words / 6)) * 10) / 10;
}

/** Los textos de un slide que cuentan para el tiempo de lectura. */
export function slideTexts(slide: { titulo?: string; cuerpo?: string | null; dato?: string | null; etiqueta?: string | null }): string[] {
  return [slide.titulo, slide.cuerpo, slide.dato, slide.etiqueta].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export type ClipOptions = {
  /** Ruta del PNG de cada capa (solo `fondo` es obligatoria; las demás solo si el slide tiene esa pieza). */
  layers: Partial<Record<Layer, string>>;
  seconds: number;
  output: string;
};

/** Cuándo entra cada pieza (segundos): una tras otra, con el ícono primero. */
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

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Argumentos de ffmpeg para un clip: el fondo respira (un acercamiento muy leve que sube y baja) y cada capa entra con un desvanecido
 * y un pequeño movimiento (el ícono rebota; el título, el texto y los extras suben suave). Sin audio. MP4 H.264 listo para Instagram.
 */
export function clipArgs(o: ClipOptions): string[] {
  if (!o.layers.fondo) throw new Error("Falta la capa de fondo");
  if (!(o.seconds >= 2 && o.seconds <= 12)) throw new Error("La duración del clip no es válida");
  const d = o.seconds;
  const present = LAYERS.filter((l) => o.layers[l]);
  const times = entryTimes(Object.fromEntries(present.map((l) => [l, true])));

  const inputs = present.flatMap((l) => ["-loop", "1", "-framerate", String(FPS), "-t", f(d), "-i", o.layers[l]!]);
  const graph: string[] = [`[0:v]scale=w='trunc(${CLIP_W}*(1+0.04*sin(PI*t/${f(d)}))/2)*2':h=-2:eval=frame:flags=bicubic,crop=${CLIP_W}:${CLIP_H},setsar=1,format=yuv420p[b0]`];

  let last = "b0";
  present.slice(1).forEach((layer, k) => {
    const idx = k + 1;
    const t0 = times[layer]!;
    const u = `clip((t-${f(t0)})/0.6,0,1)`;
    // El ícono rebota (sube con un vaivén que se apaga); lo demás sube suave y se detiene.
    const dy = layer === "icono" ? `70*exp(-5*max(0,t-${f(t0)}))*cos(14*max(0,t-${f(t0)}))` : `55*pow(1-${u},3)`;
    graph.push(`[${idx}:v]format=rgba,fade=t=in:st=${f(t0)}:d=0.45:alpha=1[l${idx}]`);
    graph.push(`[${last}][l${idx}]overlay=x=0:y='${dy}':format=auto[o${idx}]`);
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
