// Tendencias (skill 12 v2): la lista del día la baja Apify; la IA solo la adapta a cada marca.
import { z } from "zod";

const str = z.string();
const strN = z.string().nullable().default(null);

export const trendSchema = z.object({
  id: str,
  tipo: z.enum(["cancion", "hashtag", "formato"]).catch("formato"),
  nombre: str,
  descripcion: str.default(""),
  red: str.default("tiktok"),
  pais: str.default("MX"),
  posicion: z.number().default(0),
  estado: z.enum(["subiendo", "pico", "bajando"]).catch("pico"),
  dias_en_lista: z.number().default(0),
  publicaciones: z.number().default(0),
  link_ejemplo: strN,
  audio: z.object({ nombre: strN, link: strN }).default({ nombre: null, link: null }),
});
export type Trend = z.infer<typeof trendSchema>;

export const ideaSchema = z
  .object({
    tendencia_id: str,
    tendencia_nombre: str.default(""),
    formato: z.enum(["reel", "carrusel", "historia"]).catch("reel"),
    redes: z.array(str).default([]),
    pilar: str.default(""),
    urgencia: z.object({ estado: z.enum(["pico", "subiendo"]).catch("subiendo"), texto: str.default(""), grabar_antes_de: str.default("") }).passthrough(),
    cuando_grabar: str.default(""),
    por_que_te_sirve: str.default(""),
    idea: str,
    gancho: str.default(""),
    guion: z.array(str).default([]),
    como_grabarla: str.default(""),
    audio: z.object({ nombre: strN, nota: strN, link: strN }).passthrough().default({ nombre: null, nota: null, link: null }),
    video_ejemplo: strN,
    siguiente_paso: z.enum(["grabar", "skill_7", "skill_8", "skill_13"]).catch("grabar"),
  })
  .passthrough();
export type TrendIdea = z.infer<typeof ideaSchema>;

export const trendsOutput = z
  .object({
    skill_version: str.optional(),
    fecha: strN,
    ideas: z.array(ideaSchema).default([]),
    descartadas: z.array(z.object({ tendencia_id: str, motivo: str.default("") }).passthrough()).default([]),
    aviso: strN,
  })
  .passthrough();
export type TrendsOut = z.infer<typeof trendsOutput>;

export const MAX_REFRESH = 2;
export const IDEAS_PER_USE = 3;
/** Días máximos para grabar según el estado de la tendencia (regla 3). */
export const WINDOW_DAYS = { pico: 2, subiendo: 4 } as const;

/** Solo se usan tendencias que ya no van a la baja y que el creador no usó (reglas 3 y 10), por código. */
export function usable(list: Trend[], used: Set<string>): Trend[] {
  return list.filter((t) => t.estado !== "bajando" && !used.has(t.id));
}

/** Reglas por código sobre la salida: solo tendencias de la lista, sin repetir, 3 ideas y fecha límite desde hoy. */
export function shapeIdeas(out: TrendsOut, list: Trend[], used: Set<string>, shown: Set<string>, today: string): TrendsOut {
  const byId = new Map(list.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const ideas: TrendIdea[] = [];
  for (const i of out.ideas) {
    const t = byId.get(i.tendencia_id);
    if (!t || t.estado === "bajando" || used.has(t.id) || shown.has(t.id) || seen.has(t.id)) continue;
    seen.add(t.id);
    const estado = t.estado === "pico" ? "pico" : "subiendo";
    ideas.push({
      ...i,
      tendencia_nombre: t.nombre,
      urgencia: { ...i.urgencia, estado, grabar_antes_de: addDaysIso(today, WINDOW_DAYS[estado]) },
      // Los links se copian tal cual de la tendencia; la IA no los inventa (regla 14).
      video_ejemplo: t.link_ejemplo,
      audio: { ...i.audio, nombre: t.audio.nombre ?? i.audio.nombre ?? null, link: t.audio.link },
    });
    if (ideas.length >= IDEAS_PER_USE) break;
  }
  return { ...out, ideas, aviso: ideas.length < IDEAS_PER_USE ? (out.aviso ?? "Hoy hay pocas tendencias que encajen con tu marca.") : out.aviso };
}

export const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
