import "server-only";
import { spawn } from "node:child_process";

/** Canvas final del video completo: vertical 9:16 (formato de reel). Las tomas 3:4 se recortan a los lados, centradas. */
export const OUT_W = 1080;
export const OUT_H = 1920;
export const MAX_JOIN_SECONDS = 600;

/** Argumentos de ffmpeg para unir N partes (con audio) en un solo MP4 H.264/AAC listo para Instagram, TikTok y Facebook. Pura: se prueba sin ffmpeg. */
export function joinArgs(inputs: string[], output: string): string[] {
  if (inputs.length < 1) throw new Error("No hay partes que unir");
  const filters = inputs.map(
    (_, i) =>
      `[${i}:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1,fps=30,format=yuv420p[v${i}];` +
      `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
  );
  const concat = `${inputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${inputs.length}:v=1:a=1[v][a]`;
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs.flatMap((f) => ["-i", f]),
    "-filter_complex",
    `${filters.join(";")};${concat}`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-threads",
    "1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-t",
    String(MAX_JOIN_SECONDS),
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Corre ffmpeg sin shell (los argumentos van como lista, no como texto) y con tope de tiempo. */
export function runFfmpeg(args: string[], timeoutMs = 10 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    // En Linux corre con prioridad baja (nice) para no quitarle procesador a las demás apps del servidor.
    const lowPriority = process.platform === "linux";
    const p = lowPriority ? spawn("nice", ["-n", "10", process.env.FFMPEG_BIN || "ffmpeg", ...args], { stdio: ["ignore", "ignore", "pipe"] }) : spawn(process.env.FFMPEG_BIN || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d: Buffer) => {
      if (err.length < 2000) err += d.toString();
    });
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffmpeg tardó demasiado"));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(new Error(`No se pudo ejecutar ffmpeg: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con error ${code}: ${err.slice(-300)}`));
    });
  });
}

/** Duración (s) y ancho (px) de un video, con ffprobe (viene con ffmpeg). */
export function probeVideo(file: string): Promise<{ duration: number; width: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.FFPROBE_BIN || "ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,codec_type", file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.on("error", (e) => reject(new Error(`No se pudo ejecutar ffprobe: ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe no pudo leer el video"));
      try {
        const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number }[] };
        resolve({ duration: Number(j.format?.duration ?? 0) || 0, width: j.streams?.find((s) => s.codec_type === "video")?.width ?? 0 });
      } catch {
        reject(new Error("ffprobe devolvió algo ilegible"));
      }
    });
  });
}
