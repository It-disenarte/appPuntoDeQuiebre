// Carruseles (skill 8 v2): brief, salida de cada modo de la skill y reglas de forma que se validan por código.
import { z } from "zod";

const str = z.string();
const strN = z.string().nullable().default(null);

export const TYPES = [
  { id: "ensena", label: "Enseño algo", hint: "Un método o pasos" },
  { id: "lista", label: "Lista", hint: "“5 cosas que…”" },
  { id: "historia", label: "Mi historia", hint: "Algo que me pasó y lo que aprendí" },
  { id: "historia_curiosa", label: "Historia curiosa", hint: "La historia de un invento o de otra persona" },
  { id: "rompe_mitos", label: "Rompe-mitos", hint: "“Te dijeron X, pero…”" },
  { id: "antes_despues", label: "Antes y después", hint: "Un caso o resultado" },
  { id: "anuncio", label: "Anuncio", hint: "Lanzamiento, evento o promo" },
  { id: "recomiendame", label: "No sé, recomiéndame", hint: "Te sugerimos uno" },
] as const;
export const GOALS = [
  { id: "guardados", label: "Que lo guarden" },
  { id: "compartidos", label: "Que lo compartan" },
  { id: "comentarios", label: "Que comenten" },
  { id: "leads", label: "Que me escriban" },
  { id: "seguidores", label: "Que me sigan" },
] as const;
export const IMAGE_STYLES = [
  { id: "solo_texto", label: "Solo texto", hint: "El más rápido: diseño con tu kit" },
  { id: "mis_fotos", label: "Con mis fotos", hint: "Te decimos qué fotos subir" },
  { id: "ia", label: "Con imágenes de IA", hint: "Te damos los prompts para Gemini o ChatGPT" },
  { id: "mixto", label: "Mixto", hint: "Tu foto en la portada y algunas de IA o solo texto" },
] as const;

export const briefSchema = z.object({
  tema: z.string().trim().min(3, "Cuéntanos de qué trata (mínimo 3 letras).").max(140),
  origen: z.enum(["parrilla", "propio"]).default("propio"),
  tipo: z.enum(TYPES.map((t) => t.id) as [string, ...string[]]),
  objetivo: z.enum(GOALS.map((g) => g.id) as [string, ...string[]]),
  palabra_clave: z.string().trim().max(30).nullable().default(null),
  estilo_imagenes: z.enum(IMAGE_STYLES.map((s) => s.id) as [string, ...string[]]),
  animado: z.boolean().default(false),
});
export type Brief = z.infer<typeof briefSchema>;
export const needsImages = (b: Brief) => b.estilo_imagenes !== "solo_texto";
export const needsInterview = (b: Brief) => b.estilo_imagenes === "ia" || b.estilo_imagenes === "mixto";

/* ───────────── Modo ideas ───────────── */

export const ideasOutput = z
  .object({
    skill_version: str.optional(),
    tipo_recomendado: strN,
    porque_tipo: strN,
    ideas: z.array(z.object({ id: str, angulo: str.default(""), titulo: str, promesa: str.default("") }).passthrough()).min(1).max(3),
  })
  .passthrough();
export type IdeasOut = z.infer<typeof ideasOutput>;
export type Idea = IdeasOut["ideas"][number];

/* ───────────── Modo entrevista_ia ───────────── */

export const interviewOutput = z
  .object({
    skill_version: str.optional(),
    preguntas: z
      .array(
        z
          .object({
            id: str,
            texto: str,
            opciones: z.array(str).default([]),
            recomendada: str.optional(),
            porque: str.optional(),
            multiple: z.boolean().optional(),
            tipo: str.optional(),
            ejemplo: str.optional(),
            permite_inspo: z.boolean().optional(),
            elige_por_mi: z.boolean().optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(10),
  })
  .passthrough();
export type InterviewOut = z.infer<typeof interviewOutput>;

export const interviewAnswersSchema = z.object({
  estilo: z.string().max(120).default("elige_por_mi"),
  ambiente: z.array(z.string().max(60)).max(4).default([]),
  aparece_creador: z.enum(["no", "si_con_foto_referencia", "mixta"]).default("no"),
  colores: z.enum(["kit", "otros"]).default("kit"),
  colores_otros: z.string().max(120).nullable().default(null),
  narracion: z.string().max(1500).default(""),
  herramienta: z.enum(["gemini", "chatgpt", "no_se"]).default("no_se"),
});
export type InterviewAnswers = z.infer<typeof interviewAnswersSchema>;

/* ───────────── Modo carrusel / slide ───────────── */

export const TEMPLATES = ["portada_impacto", "portada_texto", "portada_foto", "texto", "texto_foto", "foto_texto_libre", "frase", "numero", "foto_completa", "lista", "cita", "cta"] as const;
export type Template = (typeof TEMPLATES)[number];
export const TEMPLATE_LABEL: Record<Template, string> = {
  portada_impacto: "Portada de impacto",
  portada_texto: "Portada de texto",
  portada_foto: "Portada con foto",
  texto: "Texto con ícono",
  texto_foto: "Foto y bloque de texto",
  foto_texto_libre: "Texto sobre foto",
  frase: "Frase grande",
  numero: "Número gigante",
  foto_completa: "Foto completa",
  lista: "Lista",
  cita: "Cita",
  cta: "Cierre (acción)",
};
/** Plantillas que llevan imagen de fondo o principal. */
export const IMAGE_TEMPLATES: Template[] = ["portada_impacto", "portada_foto", "texto_foto", "foto_texto_libre", "foto_completa"];
export const usesImage = (t: string) => (IMAGE_TEMPLATES as string[]).includes(t);

export const MOTIONS = ["fondo_respira", "particulas_orbita", "ken_burns", "resaltado_dibuja", "icono_rebote", "numero_sube", "texto_onda"] as const;

export const slideSchema = z
  .object({
    n: z.number().int().min(1),
    rol: str.default("punto"),
    plantilla: z.enum(TEMPLATES).catch("texto"),
    titulo: str,
    cuerpo: strN,
    resaltar: strN,
    icono: strN,
    dato: strN,
    etiqueta: strN,
    movimiento: z.array(str).default([]),
    imagen: z
      .object({
        fuente: z.enum(["ninguna", "foto_creador", "ia"]).catch("ninguna").default("ninguna"),
        foto_guia: z.object({ que_foto: str.default(""), como_tomarla: str.default(""), alternativa: str.default("") }).passthrough().nullable().default(null),
        prompt_ia: strN,
        zona_texto: z.enum(["arriba", "abajo", "izquierda", "derecha", "centro", "ninguna"]).catch("ninguna").default("ninguna"),
      })
      .passthrough()
      .default({ fuente: "ninguna", foto_guia: null, prompt_ia: null, zona_texto: "ninguna" }),
  })
  .passthrough();
export type Slide = z.infer<typeof slideSchema>;

export const BG_IDS = ["rosa", "blanco", "amarillo", "gradiente", "textura"] as const;
export const carruselOutput = z
  .object({
    skill_version: str.optional(),
    titulo: str,
    tipo: str.default(""),
    estructura_porque: str.default(""),
    estilo_detectado: strN,
    slides: z.array(slideSchema).min(3).max(12),
    animacion: z.object({ duracion_s: z.number().default(6), hilo_comun: strN, porque: strN }).passthrough().default({ duracion_s: 6, hilo_comun: null, porque: null }),
    fondo_slides_texto: z
      .object({
        recomendado: str.default("blanco"),
        elegido: strN,
        porque: str.default(""),
        opciones: z.array(z.object({ id: str, tipo: str.default("solido"), nombre: str.default(""), colores: z.array(str).default([]), prompt_ia: strN }).passthrough()).default([]),
      })
      .passthrough()
      .optional(),
    bloque_estilo_ia: strN,
    instrucciones_ia: z.array(str).default([]),
    datos_para_caption: z.object({ tema: str.default(""), promesa: str.default(""), palabra_clave: strN }).passthrough().optional(),
    mensaje_al_creador: str.default(""),
  })
  .passthrough();
export type CarruselOut = z.infer<typeof carruselOutput>;

export const slideOutput = z.object({ skill_version: str.optional(), slide: slideSchema, que_cambie: str.default("") }).passthrough();
export type SlideOut = z.infer<typeof slideOutput>;

/* ───────────── Límites de la skill (reglas 33–35) ───────────── */
export const MAX_IDEA_REFRESH = 2;
export const MAX_SLIDE_ATTEMPTS = 3;
export const MAX_FULL_REDO = 2;
export const MAX_AI_IMAGES = 7;
export const MAX_OWN_PHOTOS = 4;

/** Normaliza un carrusel recién generado: numera, aplica límites y asegura una portada. */
export function normalizeCarousel(c: CarruselOut): CarruselOut {
  const slides = c.slides.slice(0, 10).map((s, i) => ({ ...s, n: i + 1 }));
  if (slides[0] && !["portada_impacto", "portada_texto", "portada_foto"].includes(slides[0].plantilla)) slides[0] = { ...slides[0], plantilla: "portada_impacto" };
  return { ...c, slides };
}

/** Etiqueta corta del número de slides con imagen (ayuda a la regla de “2 de cada 3”). */
export function imageStats(slides: Slide[]) {
  const ai = slides.filter((s) => s.imagen.fuente === "ia").length;
  const own = slides.filter((s) => s.imagen.fuente === "foto_creador").length;
  return { ai, own, withImage: ai + own, total: slides.length };
}

export const textEditSchema = z.object({
  titulo: z.string().trim().min(1, "El título no puede quedar vacío.").max(90),
  cuerpo: z.string().trim().max(260).nullable().default(null),
  resaltar: z.string().trim().max(40).nullable().default(null),
  plantilla: z.enum(TEMPLATES),
});
