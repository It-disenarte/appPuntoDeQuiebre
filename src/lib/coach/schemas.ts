// El Lente (skill 11): salida validada y reglas de forma que se cumplen por código.
import { z } from "zod";

const str = z.string();
export const AREAS = ["gancho", "forma_de_hablar", "tecnica", "contenido"] as const;
export const AREA_LABEL: Record<(typeof AREAS)[number], string> = { gancho: "Gancho", forma_de_hablar: "Forma de hablar", tecnica: "Técnica", contenido: "Contenido" };
export const MAX_REVIEWS_PER_VIDEO = 2;
export const MAX_IMPROVEMENTS = 2;

const area = z.enum(AREAS).catch("contenido");

export const coachOutput = z
  .object({
    skill_version: str.optional(),
    numero_revision: z.coerce.number().optional(),
    veredicto: z.enum(["listo", "otra_toma_opcional"]).catch("listo"),
    titular: str.default(""),
    logro: z.object({ area, segundo: z.coerce.number().default(0), texto: str }).passthrough(),
    mejoras: z
      .array(z.object({ area, segundo: z.coerce.number().default(0), que_paso: str, como_mejorarlo: str, frase_sugerida: z.string().nullable().default(null) }).passthrough())
      .default([]),
    comparacion: z.object({ mejoro: z.array(str).default([]), sigue_pendiente: z.array(str).default([]) }).passthrough().nullable().default(null),
    cierre: str.default(""),
    botones: z.array(str).default([]),
  })
  .passthrough();
export type CoachOut = z.infer<typeof coachOutput>;

/** Reglas 2 y 3 de la skill, por código: máx. 2 mejoras; la segunda revisión siempre es “listo”. */
export function normalizeReview(o: CoachOut, numero: number): CoachOut {
  const mejoras = o.mejoras.slice(0, MAX_IMPROVEMENTS);
  return { ...o, numero_revision: numero, mejoras, veredicto: numero >= 2 ? "listo" : mejoras.length ? o.veredicto : "listo", comparacion: numero >= 2 ? o.comparacion : null };
}

/** Palabras que la skill prohíbe en el texto (regla 4): si salen, se suaviza en pantalla solo avisando al equipo. */
export const FORBIDDEN = /\b(mal|error|falla|deber[ií]as|no sirve)\b/i;

export const voteSchema = z.object({ voto: z.enum(["si", "no"]), nota: z.string().max(300).optional() });
