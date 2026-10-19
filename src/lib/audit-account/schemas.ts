// Auditoría inicial (skill 0): salida validada y reglas por código.
import { z } from "zod";

const str = z.string();
export const MIN_POSTS = 9;
export const CARD_KINDS = ["tema", "tono", "visual", "publico", "habito"] as const;

export const auditOutput = z
  .object({
    skill_version: str.optional(),
    modo: z.enum(["completo", "sin_contenido"]).catch("completo"),
    numeros_clave: z.object({ publicaciones_analizadas: z.coerce.number().default(0), formato_que_mas_alcanza: str.default(""), pct_alcance_no_seguidores: z.coerce.number().default(0), mejor_hora: str.default("") }).passthrough().default({ publicaciones_analizadas: 0, formato_que_mas_alcanza: "", pct_alcance_no_seguidores: 0, mejor_hora: "" }),
    temas_detectados: z.array(z.object({ tema: str, presencia: z.enum(["alta", "media", "baja"]).catch("media"), rendimiento: z.enum(["alto", "medio", "bajo"]).catch("medio") }).passthrough()).default([]),
    dices_vs_publicas: z.object({ bio_promete: str.default(""), contenido_muestra: str.default(""), coincidencia: z.enum(["alta", "media", "baja"]).catch("media"), comentario: str.default("") }).passthrough().nullable().default(null),
    tono_detectado: z.object({ adjetivos: z.array(str).default([]), descripcion: str.default("") }).passthrough().nullable().default(null),
    visual_detectado: z.object({ colores: z.array(z.object({ nombre: str, hex: str, donde: str.default("") }).passthrough()).default([]), consistencia: str.default(""), comentario: str.default("") }).passthrough().nullable().default(null),
    top_publicaciones: z.array(z.object({ id: str, tema: str.default(""), por_que_funciono: str.default("") }).passthrough()).default([]),
    tarjetas: z.array(z.object({ id: str, tipo: z.enum(CARD_KINDS).catch("tema"), texto: str }).passthrough()).default([]),
    preguntas_pendientes: z.array(str).default([]),
    para_reglas: z.object({ videos_validos: z.coerce.number().default(0), usa_datos_propios: z.boolean().default(false), ganchos_que_funcionaron: z.array(str).default([]) }).passthrough().default({ videos_validos: 0, usa_datos_propios: false, ganchos_que_funcionaron: [] }),
  })
  .passthrough();
export type AuditOut = z.infer<typeof auditOutput>;

/**
 * Reglas 1, 2, 7, 8 y 9 por código: con pocas publicaciones no hay tarjetas; de 5 a 7 tarjetas; máx. 5 destacadas;
 * “datos propios” solo con 30 o más reels; máx. 4 preguntas pendientes.
 */
export function shapeAudit(o: AuditOut, posts: number, validReels: number): AuditOut {
  const few = posts < MIN_POSTS;
  return {
    ...o,
    modo: few ? "sin_contenido" : o.modo,
    tarjetas: few || o.modo === "sin_contenido" ? [] : o.tarjetas.slice(0, 7),
    top_publicaciones: o.top_publicaciones.slice(0, 5),
    preguntas_pendientes: o.preguntas_pendientes.slice(0, 4),
    para_reglas: { ...o.para_reglas, videos_validos: validReels, usa_datos_propios: validReels >= 30 },
  } as AuditOut;
}

export const cardVoteSchema = z.object({ voto: z.enum(["si", "no", "ajustar"]), nota: z.string().max(300).optional() });
export type CardVote = z.infer<typeof cardVoteSchema>;
