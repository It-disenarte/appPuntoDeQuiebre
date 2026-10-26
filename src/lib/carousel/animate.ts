// Carrusel animado: arma el video (reel vertical) a partir de los PNG de los slides. Todo lo de aquí es puro (se prueba sin ffmpeg).

export const FPS = 30;
export const OUT_W = 1080;
export const OUT_H = 1920;
/** Los slides son 1080 × 1350 (4:5): se centran en el lienzo vertical 9:16. */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
export const SLIDE_Y = (OUT_H - SLIDE_H) / 2;
export const TRANSITION_S = 0.5;
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 12;
/** Un slide pesa mucho menos de esto; el tope evita que se cuele un archivo enorme. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const MAX_ZIP_BYTES = 60 * 1024 * 1024;

const TRANSITIONS = ["slideleft", "fade", "smoothleft", "circleopen", "slideleft", "wipeleft", "fade", "smoothright"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Cuántos segundos se ve cada slide: lo que tarda en leerse (unas 3 palabras por segundo) con un mínimo y un máximo. La portada y el cierre se quedan un poco más. */
export function slideSeconds(texts: string[], index: number, total: number): number {
  const words = texts.join(" ").split(/\s+/).filter(Boolean).length;
  const base = Math.min(6, Math.max(3, 2 + words / 3));
  const bonus = index === 0 ? 0.5 : index === total - 1 ? 1 : 0;
  return Math.round((base + bonus) * 10) / 10;
}

/** Los textos de un slide que cuentan para el tiempo de lectura. */
export function slideTexts(slide: { titulo?: string; cuerpo?: string | null; dato?: string | null; etiqueta?: string | null }): string[] {
  return [slide.titulo, slide.cuerpo, slide.dato, slide.etiqueta].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export type AnimateOptions = {
  frames: string[];
  /** Segundos de cada slide (misma longitud que `frames`). */
  seconds: number[];
  /** Color de fondo del lienzo vertical (#RRGGBB), el de la marca. */
  background: string;
  output: string;
};

/** Duración total del video: los slides menos lo que se solapa en cada transición. */
export function totalSeconds(seconds: number[]): number {
  return seconds.reduce((s, x) => s + x, 0) - Math.max(0, seconds.length - 1) * TRANSITION_S;
}

/**
 * Argumentos de ffmpeg: cada slide entra como imagen fija con un zoom suave (alternando acercar y alejar) sobre un lienzo 9:16 del
 * color de la marca, y se unen con transiciones. Sin audio (cada quien le pone su música en Instagram). MP4 H.264 listo para subir.
 */
export function animateArgs(o: AnimateOptions): string[] {
  const n = o.frames.length;
  if (n < MIN_SLIDES || n > MAX_SLIDES) throw new Error(`El carrusel debe tener entre ${MIN_SLIDES} y ${MAX_SLIDES} slides`);
  if (o.seconds.length !== n) throw new Error("Falta la duración de algún slide");
  const bg = HEX.test(o.background) ? o.background.replace("#", "0x") : "0x111111";

  const clips: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = o.seconds[i]!;
    const frames = Math.max(1, Math.round(d * FPS));
    const zoom = i % 2 === 0 ? `1+0.06*on/${frames}` : `1.06-0.06*on/${frames}`;
    // Se amplía al doble antes del zoom para que el movimiento no tiemble (zoompan recorta en píxeles enteros).
    clips.push(
      `[${i}:v]scale=${SLIDE_W * 2}:${SLIDE_H * 2}:flags=lanczos,setsar=1,zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=${SLIDE_W}x${SLIDE_H}:fps=${FPS}[z${i}]`,
      `color=c=${bg}:s=${OUT_W}x${OUT_H}:r=${FPS}:d=${d}[b${i}]`,
      `[b${i}][z${i}]overlay=0:${SLIDE_Y}:shortest=1,format=yuv420p,setsar=1[c${i}]`,
    );
  }

  const joins: string[] = [];
  let acc = o.seconds[0]!;
  let last = "c0";
  for (let i = 1; i < n; i++) {
    const offset = Math.round((acc - TRANSITION_S) * 1000) / 1000;
    const out = i === n - 1 ? "v" : `x${i}`;
    joins.push(`[${last}][c${i}]xfade=transition=${TRANSITIONS[(i - 1) % TRANSITIONS.length]}:duration=${TRANSITION_S}:offset=${offset}[${out}]`);
    acc = acc + o.seconds[i]! - TRANSITION_S;
    last = out;
  }

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...o.frames.flatMap((f) => ["-i", f]),
    "-filter_complex",
    [...clips, ...joins].join(";"),
    "-map",
    "[v]",
    "-an",
    "-threads",
    "2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-movflags",
    "+faststart",
    o.output,
  ];
}

/** Un PNG de verdad (y no cualquier archivo con extensión .png). */
export const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
/** Un ZIP de verdad (firma "PK"). */
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);
