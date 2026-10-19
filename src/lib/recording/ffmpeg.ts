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
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
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
