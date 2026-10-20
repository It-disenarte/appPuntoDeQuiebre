// Esquemas de salida de las skills (los campos vienen de los archivos de Mishell en skills/<nombre>/v<N>/skill.md).
// Regla de oro: los nombres de campo no se renombran entre versiones, solo se agregan; por eso `passthrough()`.
import { z } from "zod";

const str = z.string();
const strs = z.array(z.string());
/** Texto que la IA a veces devuelve como null cuando no tiene nada que decir (p. ej. la visión a futuro): se guarda como vacío. */
const softStr = z.preprocess((v) => (v == null ? "" : v), z.string());

/* ───────────── brujula-v2 ───────────── */

export const PILLAR_CATEGORIES = ["viral", "nicho", "conversion"] as const;

export const brujulaV2Output = z
  .object({
    skill_version: str,
    nicho: z.object({ principal: str, enfoque: str }).passthrough(),
    publico: z.object({ descripcion: str, rango_edad: str, dolores: strs, deseos: strs }).passthrough(),
    propuesta_valor: str,
    frase_de_marca: str,
    pilares: z
      .array(z.object({ nombre: str, descripcion: str, categoria_dominante: z.enum(PILLAR_CATEGORIES), ideas_de_tema: strs }).passthrough())
      .min(3)
      .max(5),
    tono: z.object({ adjetivos: strs, descripcion: str }).passthrough(),
    palabras_si: strs.min(1).max(15),
    palabras_no: strs.min(1).max(10),
    postura: str,
    puente: str.nullable(),
    vision: z.object({ hoy: softStr, despues: softStr }).passthrough(),
    estilo_grabacion: z.object({ formato_principal: str, descripcion: softStr }).passthrough(),
    lives: z.object({ hace_lives: z.boolean(), plataforma: str.nullable(), frecuencia: str.nullable() }).passthrough(),
    // Sin kit visual (Fase 2B) la IA puede devolver null.
    kit_visual_ref: str.nullable(),
    mensaje_al_creador: str,
    datos_faltantes: strs.default([]),
  })
  .passthrough();
export type BrujulaV2 = z.infer<typeof brujulaV2Output>;

/** Secciones del manual que el creador califica una por una (regla 14 de la skill). */
export const MANUAL_SECTIONS = [
  { id: "nicho", title: "Nicho y propuesta", fields: ["nicho", "propuesta_valor", "frase_de_marca"] },
  { id: "publico", title: "Tu público", fields: ["publico"] },
  { id: "pilares", title: "Pilares de contenido", fields: ["pilares"] },
  { id: "tono", title: "Tono y palabras", fields: ["tono", "palabras_si", "palabras_no"] },
  { id: "postura", title: "Postura y visión", fields: ["postura", "puente", "vision", "estilo_grabacion"] },
] as const;
export type SectionId = (typeof MANUAL_SECTIONS)[number]["id"];
export const SECTION_IDS = MANUAL_SECTIONS.map((s) => s.id) as [SectionId, ...SectionId[]];

/* ───────────── perfil-voz-v1 ───────────── */

export const perfilVozV1Output = z
  .object({
    skill_version: str,
    formalidad: z.coerce.number().int().min(1).max(5),
    energia: str,
    ritmo: str,
    estructura_tipica: strs,
    palabras_frecuentes: strs,
    muletillas: z.array(z.object({ texto: str, uso: str }).passthrough()).default([]),
    frases_firma: strs.default([]),
    como_aconseja: str,
    humor: str,
    recursos: strs,
    evitar: strs,
    ejemplo: z.object({ generico: str, en_su_voz: str }).passthrough(),
    reglas_para_guiones: strs,
    preferencias_aprendidas: z.array(z.object({ cambia: str, por: str, motivo: str }).passthrough()).default([]),
  })
  .passthrough();
export type PerfilVozV1 = z.infer<typeof perfilVozV1Output>;

/* ───────────── horario-v1 ───────────── */

export const horarioV1Output = z
  .object({
    skill_version: str,
    bloques: z.array(
      z
        .object({
          tipo: z.enum(["fijo", "respaldo"]),
          dia: str.nullable(),
          inicio: str.nullable(),
          fin: str.nullable(),
          nota: str.optional(),
          flotante: z.boolean().optional(),
        })
        .passthrough(),
    ),
    horas_semana: z.number(),
    horas_con_extra: z.number().optional(),
    sugerencia: str.nullable().optional(),
    publicar: z.object({ hora: str, por_que: str }).passthrough(),
    recordatorios: z.array(z.object({ cuando: str, texto: str }).passthrough()),
    consejos: strs,
    mensaje: str,
  })
  .passthrough();
export type HorarioV1 = z.infer<typeof horarioV1Output>;

/* ───────────── parrilla-guiones-v1 (borrador) ───────────── */

export const videoGuionSchema = z
  .object({ gancho: str, cuerpo: strs.min(1).max(8), cierre: str, duracion_segundos: z.number().default(35), nota_grabacion: str.default("") })
  .passthrough();
export const carruselGuionSchema = z.object({ titulo: str, idea_central: str.default(""), puntos: strs.min(1).max(10), cierre: str.default("") }).passthrough();
export type VideoGuion = z.infer<typeof videoGuionSchema>;
export type CarruselGuion = z.infer<typeof carruselGuionSchema>;

export const parrillaV1Output = z
  .object({
    skill_version: str.optional(),
    resumen_semana: str.default(""),
    piezas: z
      .array(
        z
          .object({
            n: z.number().int(),
            pilar: str,
            tema: str,
            idea: str.default(""),
            guion: z.union([videoGuionSchema, carruselGuionSchema]),
            variante: z.object({ gancho_b: str.nullable().default(null), angulo_b: str.nullable().default(null) }).passthrough().nullable().default(null),
            tarjeta_prueba: str.nullable().default(null),
          })
          .passthrough(),
      )
      .min(1)
      .transform((a) => a.slice(0, 10)),
  })
  .passthrough();
export type ParrillaV1 = z.infer<typeof parrillaV1Output>;

/* ───────────── textos-publicacion-v2 ───────────── */

export const textosV2Output = z
  .object({
    skill_version: str.optional(),
    ganchos: strs.min(1).max(5),
    gancho_elegido: z.number().int().min(0).max(4).default(0),
    instagram: z.object({ texto: str, hashtags: strs.default([]), primer_comentario: str.nullable().default(null), caracteres: z.number().optional() }).passthrough().optional(),
    tiktok: z.object({ texto: str, hashtags: strs.default([]), texto_en_pantalla: str.default("") }).passthrough().optional(),
    facebook: z.object({ texto: str, hashtags: strs.default([]) }).passthrough().optional(),
    datos_a_verificar: strs.default([]),
  })
  .passthrough();
export type TextosV2 = z.infer<typeof textosV2Output>;

/* ───────────── ideas-historias-v2 ───────────── */

const storyIdea = z.object({ tipo: str, idea: str, texto_sugerido: str.default(""), sticker: str.nullable().default(null) }).passthrough();
export const historiasV2Output = z
  .object({
    skill_version: str.optional(),
    temas_boton: strs.default([]),
    semana: z
      .array(
        z
          .object({
            dia: str,
            tipo: str,
            idea: str,
            texto_sugerido: str.default(""),
            sticker: str.nullable().default(null),
            minutos: z.number().default(3),
            tema_enfoque: str.nullable().default(null),
            alimenta_parrilla: z.boolean().default(false),
            alternativas: z.array(storyIdea).default([]),
          })
          .passthrough(),
      )
      .min(1)
      .max(7),
    datos_a_verificar: strs.default([]),
  })
  .passthrough();
export type HistoriasV2 = z.infer<typeof historiasV2Output>;
