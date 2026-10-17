// Analizador de competencia: réplica en esta app de lo que hace el analizador de referencia (raspar los reels recientes de
// la competencia, quedarse con los más vistos, descomponerlos con un modelo de video y escribir conceptos nuevos para la marca).
import { z } from "zod";

const str = z.string();
const strs = z.array(z.string());

/** Cuenta de Instagram válida (sin @, sin enlaces): evita meter nada raro en las URL que se piden a Apify. */
export const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

/** Acepta "@usuario", "usuario" o un enlace de Instagram y devuelve el usuario en minúsculas (o null si no es válido). */
export function normalizeUsername(input: string): string | null {
  let s = input.trim().toLowerCase();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]+)/);
  if (m) s = m[1]!;
  s = s.replace(/^@/, "").replace(/[/?#].*$/, "");
  return USERNAME_RE.test(s) && !s.endsWith(".") ? s : null;
}

export const MAX_COMPETITORS = 8;
export const RUN_INTERVAL_DAYS = 7;

export const paramsSchema = z.object({
  /** Cuántos reels trae como máximo de cada cuenta. */
  maxVideos: z.number().int().min(1).max(30).default(15),
  /** Cuántos de los más vistos se analizan por cuenta. */
  topK: z.number().int().min(1).max(3).default(2),
  /** Ventana en días hacia atrás. */
  nDays: z.number().int().min(7).max(90).default(30),
});
export type RunParams = z.infer<typeof paramsSchema>;
export const DEFAULT_PARAMS: RunParams = { maxVideos: 15, topK: 2, nDays: 30 };

/* ───────────── Salida de la skill que mira el video ───────────── */

export const videoAnalysisSchema = z
  .object({
    skill_version: str.optional(),
    concepto: str,
    gancho: z.object({ visual: str.default(""), texto: str.default(""), audio: str.default(""), por_que_funciona: str.default("") }).passthrough(),
    retencion: strs.default([]),
    recompensa: z.object({ tipo: z.enum(["educacion", "entretenimiento", "inspiracion"]).catch("educacion"), descripcion: str.default("") }).passthrough(),
    guion: str.default(""),
    formato: str.default(""),
  })
  .passthrough();
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

/* ───────────── Salida de la skill que escribe conceptos nuevos ───────────── */

export const conceptsSchema = z
  .object({
    skill_version: str.optional(),
    conceptos: z
      .array(z.object({ titulo: str, gancho: str, idea: str, guion_corto: str.default(""), por_que_encaja: str.default("") }).passthrough())
      .min(1)
      .max(5),
  })
  .passthrough();
export type Concepts = z.infer<typeof conceptsSchema>;

/* ───────────── Progreso de una corrida ───────────── */

export const progressSchema = z.object({
  phase: z.enum(["preparando", "buscando", "analizando", "listo"]).default("preparando"),
  accountsTotal: z.number().default(0),
  accountsDone: z.number().default(0),
  videosTotal: z.number().default(0),
  videosDone: z.number().default(0),
  errors: strs.default([]),
  note: str.default(""),
});
export type Progress = z.infer<typeof progressSchema>;
