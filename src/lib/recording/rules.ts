// Reglas puras de la grabación por partes: de qué se compone un video y cuánto puede pesar cada parte.
import type { VideoGuion } from "@/lib/skills/schemas";

export const PARTS = ["gancho", "cuerpo", "cierre"] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABEL: Record<Part, string> = { gancho: "Gancho", cuerpo: "Cuerpo", cierre: "Cierre" };
export const isPart = (v: string): v is Part => (PARTS as readonly string[]).includes(v);

export const MAX_PART_BYTES = 250 * 1024 * 1024;
export const MAX_PART_SECONDS = 180;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/** "video/webm;codecs=vp9" → "video/webm". */
export const baseType = (t: string) => t.split(";")[0]!.trim().toLowerCase();

/** Texto que el teleprompter muestra en cada parte. */
export function partTexts(g: VideoGuion): Record<Part, string> {
  return { gancho: g.gancho.trim(), cuerpo: g.cuerpo.map((c) => c.trim()).filter(Boolean).join("\n\n"), cierre: g.cierre.trim() };
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** Segundos aproximados para decir un texto (unas 2.5 palabras por segundo). */
export const estimateSeconds = (t: string) => Math.max(3, Math.round(words(t) / 2.5));

/** Velocidades del teleprompter en palabras por segundo (1 = lenta … 5 = rápida). */
export const SPEEDS = [1.4, 1.9, 2.5, 3.1, 3.8] as const;
export const SPEED_LABEL = ["Muy lenta", "Lenta", "Media", "Rápida", "Muy rápida"] as const;
export const clampSpeed = (n: number) => Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 3)));

export type PartState = "falta" | "grabada";
export function progress(done: Part[]) {
  const set = new Set(done);
  return { parts: PARTS.map((p) => ({ part: p, state: (set.has(p) ? "grabada" : "falta") as PartState })), complete: PARTS.every((p) => set.has(p)), next: PARTS.find((p) => !set.has(p)) ?? null };
}

/** Peso en MB (un decimal) de una parte, para avisar antes de subir con datos móviles. */
export const megabytes = (bytes: number) => Math.max(0.1, Math.round((bytes / 1048576) * 10) / 10);
