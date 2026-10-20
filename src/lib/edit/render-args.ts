// Argumentos de ffmpeg de la edición (puros: se prueban sin ffmpeg). El filtro va como un solo argumento (sin shell).
import { OUT_H, OUT_W } from "@/lib/recording/ffmpeg";
import { blurRanges, zoomExpression, type Segment } from "./timeline";
import type { Plan } from "./schemas";

/** Ruta lista para una opción de filtro: entre comillas simples y con los dos puntos escapados (sirve también con unidades de Windows). */
export const filterPath = (p: string) => {
  const slashes = p.replace(/\\/g, "/");
  const noQuotes = slashes.replace(/'/g, "'\\''");
  const colons = noQuotes.replace(/:/g, "\\:");
  return `'${colons}'`;
};

/**
 * Filtro completo: recorta y une lo que se queda, aplica los planos y acercamientos digitales (centrados un poco hacia arriba,
 * donde suele estar la cara) y quema subtítulos y textos con las fuentes del kit.
 */
export function buildFilterScript(opts: { segs: Segment[]; plan: Plan; assPath: string; fontsDir: string; lowRes?: boolean }): { script: string; hasZoom: boolean } {
  const { segs, plan } = opts;
  if (segs.length === 0) throw new Error("El video quedaría vacío: se quitaron todos los pedazos");
  const parts: string[] = [];
  segs.forEach((s, i) => {
    parts.push(`[0:v]trim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},asetpts=PTS-STARTPTS${s.silent ? ",volume=0" : ""}[a${i}]`);
  });
  parts.push(`${segs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${segs.length}:v=1:a=1[vc][a]`);
  const z = zoomExpression(plan, segs, opts.lowRes);
  const hasZoom = z !== "1";
  let last = "vc";
  // Privacidad (modo mixto): se difumina toda la imagen mientras se ve o se oye algo sensible.
  const blur = blurRanges(plan, segs);
  if (blur.length > 0) {
    const when = blur.map((r) => `between(t,${r.a.toFixed(2)},${r.b.toFixed(2)})`).join("+");
    parts.push(`[${last}]boxblur=luma_radius=40:luma_power=3:chroma_radius=40:chroma_power=3:enable='${when}'[vb]`);
    last = "vb";
  }
  if (hasZoom) {
    parts.push(`[${last}]scale=w='trunc(${OUT_W}*(${z})/2)*2':h=-2:eval=frame,crop=${OUT_W}:${OUT_H}:(iw-${OUT_W})/2:(ih-${OUT_H})*0.4[vz]`);
    last = "vz";
  }
  parts.push(`[${last}]subtitles=filename=${filterPath(opts.assPath)}:fontsdir=${filterPath(opts.fontsDir)}[v]`);
  return { script: parts.join(";\n"), hasZoom };
}

/** El filtro va como argumento directo (no en archivo): `-filter_complex_script` ya no existe en las versiones nuevas de ffmpeg. */
export function editArgs(input: string, filterGraph: string, output: string): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-filter_complex", filterGraph, "-map", "[v]", "-map", "[a]", "-threads", "1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output];
}

export function coverArgs(input: string, second: number, assPath: string, fontsDir: string, output: string): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-ss", Math.max(0, second).toFixed(3), "-i", input, "-vf", `subtitles=filename=${filterPath(assPath)}:fontsdir=${filterPath(fontsDir)}`, "-frames:v", "1", output];
}

/** Audio mono de 16 kHz para mandarlo a transcribir (pesa poco). */
export function audioArgs(input: string, output: string): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", output];
}

/** Un fotograma cada `every` segundos (máx. `max`), reducido a 480 px de ancho, para que la IA “vea” el video. */
export function frameArgs(input: string, pattern: string, every = 2, max = 8): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vf", `fps=1/${every},scale=480:-2`, "-frames:v", String(max), "-q:v", "5", pattern];
}
