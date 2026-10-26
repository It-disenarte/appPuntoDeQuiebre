import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";

/** Las skills de texto y a qué IA se manda primero cada una (la otra queda de respaldo). */
export const SKILL_ROUTES = [
  { key: "brujula", label: "Brújula de marca" },
  { key: "perfilVoz", label: "Perfil de voz" },
  { key: "kitVisual", label: "Kit visual" },
  { key: "parrilla", label: "Parrilla y guiones de la semana" },
  { key: "textos", label: "Textos de publicación" },
  { key: "historias", label: "Ideas de historias" },
  { key: "carruseles", label: "Carruseles (ideas y slides)" },
  { key: "perfil", label: "Optimización del perfil" },
  { key: "directos", label: "Guía de directos" },
  { key: "tendencias", label: "Tendencias" },
  { key: "auditoria", label: "Auditoría de la cuenta" },
  { key: "edicion", label: "Plan de edición de video (a cámara)" },
  { key: "aprendizaje", label: "Aprendizaje de tu voz y de la mezcla" },
] as const;

const modelId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{3,80}$/, "El nombre del modelo solo lleva letras, números, punto, guion y dos puntos.");

export const modelsSchema = z.object({
  /** Claude para las skills, la edición con imágenes, las métricas y el analizador. */
  claude: modelId,
  /** Gemini para las skills de texto que se mandan a Gemini. */
  geminiText: modelId,
  /** Gemini para transcribir audio, leer capturas, analizar videos y el coach. */
  geminiMedia: modelId,
  /** Gemini que crea las imágenes de los carruseles (planes Básico y sin modelo propio). */
  geminiImage: modelId,
  /** Modelo de imágenes del plan Pro (vacío = el mismo de arriba). */
  geminiImagePro: z.union([modelId, z.literal("")]),
  routing: z.record(z.string(), z.enum(["claude", "gemini"])),
});
export type Models = z.infer<typeof modelsSchema>;

/** Los valores de fábrica salen de las variables de entorno (así no cambia nada hasta que el admin lo decida). */
export function defaultModels(): Models {
  const e = env();
  const gemini = new Set((e.SKILLS_GEMINI ?? "").split(",").map((x) => x.trim()));
  return {
    claude: e.SKILLS_MODEL,
    geminiText: e.GEMINI_SKILLS_MODEL ?? e.GEMINI_MODEL,
    geminiMedia: e.GEMINI_MODEL,
    geminiImage: e.GEMINI_IMAGE_MODEL,
    geminiImagePro: "",
    routing: Object.fromEntries(SKILL_ROUTES.map((s) => [s.key, gemini.has(s.key) ? "gemini" : "claude"])),
  };
}

export const MODEL_SUGGESTIONS = {
  claude: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
  gemini: ["gemini-3.8-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  image: ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"],
} as const;

const KEY = "admin_models";
const TTL_MS = 15_000;
let cache: { at: number; v: Models } | null = null;

/** Lo que el admin configuró (con los valores de fábrica donde no ha tocado nada). Se recuerda 15 s para no ir a la base en cada llamada. */
export async function getModels(): Promise<Models> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.v;
  const base = defaultModels();
  let stored: Record<string, unknown> | null = null;
  try {
    stored = await getSetting<Record<string, unknown>>(KEY);
  } catch {
    stored = null; // sin base (p. ej. al arrancar): se usan los de fábrica
  }
  const merged = { ...base, ...(stored ?? {}), routing: { ...base.routing, ...((stored?.routing as Record<string, unknown> | undefined) ?? {}) } };
  const r = modelsSchema.safeParse(merged);
  const v = r.success ? r.data : base;
  cache = { at: Date.now(), v };
  return v;
}

export async function saveModels(raw: unknown, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = modelsSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Revisa los modelos." };
  await setSetting(KEY, r.data, adminId);
  cache = null;
  return { ok: true };
}

export const resetModelsCache = () => {
  cache = null;
};
