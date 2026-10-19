// Guía de directos (skill 15 v2). En pantalla se dice “directo”, nunca “live”.
import { z } from "zod";

const str = z.string();
const strN = z.string().nullable().default(null);

export const SITUATIONS = [
  { id: "hace", label: "Sí hago directos" },
  { id: "quiere_hacer", label: "No hago, pero quiero" },
  { id: "no_quiere", label: "No hago y no quiero" },
] as const;
export type Situation = (typeof SITUATIONS)[number]["id"];

export const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "twitch", label: "Twitch" },
  { id: "kick", label: "Kick" },
] as const;
export const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
export const MAX_ANCHORS = 3;
export const MAX_NOT_NOW = 3;

export const answersSchema = z.object({
  situacion: z.enum(["hace", "quiere_hacer", "no_quiere"]),
  plataformas: z.array(z.enum(PLATFORMS.map((p) => p.id) as [string, ...string[]])).max(3).default([]),
  dias: z.array(z.enum(DAYS)).max(7).default([]),
  hora: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  frecuencia: z.string().trim().max(80).nullable().default(null),
  compromiso: z.string().trim().max(200).nullable().default(null),
});
export type Answers = z.infer<typeof answersSchema>;

export const recommendationOutput = z
  .object({
    skill_version: str.optional(),
    recomendacion: z.object({ texto: str, plataforma_sugerida: str.default(""), por_que_esa_app: str.default(""), frecuencia_sugerida: str.default(""), duracion_sugerida_min: z.coerce.number().default(30) }).passthrough(),
  })
  .passthrough();
export type Recommendation = z.infer<typeof recommendationOutput>["recomendacion"];

const live = z
  .object({
    dia: str,
    plataforma: str.default(""),
    tipo: z.enum(["ancla", "libre"]).catch("ancla"),
    titulo: str,
    pilar: str.default(""),
    objetivo: z.enum(["conectar", "ensenar", "conversar", "divertir"]).catch("conectar"),
    apertura: str.default(""),
    puntos_para_hablar: z.array(str).default([]),
    preguntas_para_el_publico: z.array(str).default([]),
    dinamica: z.object({ nombre: str.default(""), como_se_juega: str.default("") }).passthrough().nullable().default(null),
    si_llega_hate: str.default(""),
    cierre: str.default(""),
    clip_para_reel: str.default(""),
    momento_clip: z.object({ pregunta: str.default(""), frase_marca: str.default(""), como_decirlo: str.default("") }).passthrough().nullable().default(null),
  })
  .passthrough();
export type Live = z.infer<typeof live>;

export const guideOutput = z
  .object({
    skill_version: str.optional(),
    mes: strN,
    lives_sugeridos: z.coerce.number().default(0),
    lives: z.array(live).default([]),
    comodines: z.array(str).default([]),
  })
  .passthrough();
export type GuideOut = z.infer<typeof guideOutput>;

export const supportOutput = z.object({ skill_version: str.optional(), lives: z.array(live).min(1).transform((a) => a.slice(0, 1)), comodines: z.array(str).default([]) }).passthrough();

/** Fila “libre” de un día en que hace directo pero sin guion (sin llamar a la IA). */
export const freeLive = (dia: string, plataforma: string): Live => ({ dia, plataforma, tipo: "libre", titulo: "Directo libre", pilar: "", objetivo: "conversar", apertura: "", puntos_para_hablar: [], preguntas_para_el_publico: [], dinamica: null, si_llega_hate: "", cierre: "", clip_para_reel: "", momento_clip: null });

/**
 * Reglas 10 y 3 por código: máximo 3 directos ancla por semana, solo en los días que el creador eligió; los demás días son libres.
 * Quien quiere empezar (`beginner`) hace 1 directo por semana y todos salen con guion.
 */
export function shapeWeek(out: GuideOut, opts: { weekDays: { iso: string; name: string }[]; selectedDays: string[]; platform: string; beginner: boolean }): GuideOut {
  const allowed = new Set(opts.weekDays.filter((d) => opts.selectedDays.includes(d.name)).map((d) => d.iso));
  const byDay = new Map<string, Live>();
  for (const l of out.lives) if (allowed.has(l.dia) && !byDay.has(l.dia)) byDay.set(l.dia, l);
  let anchors = 0;
  const lives: Live[] = [];
  for (const d of opts.weekDays.filter((x) => allowed.has(x.iso))) {
    const l = byDay.get(d.iso);
    if (opts.beginner) {
      if (l && lives.length < 1) lives.push({ ...l, tipo: "ancla" });
      continue;
    }
    if (l && l.tipo === "ancla" && anchors < MAX_ANCHORS) {
      anchors += 1;
      lives.push(l);
    } else lives.push(freeLive(d.iso, l?.plataforma || opts.platform));
  }
  return { ...out, lives, lives_sugeridos: lives.length };
}
