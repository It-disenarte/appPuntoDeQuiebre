// Receta para CapCut (skill 13, modo "receta_capcut"): la app NO edita estos videos; la IA arma los pasos y el código fija las reglas.
import { z } from "zod";

const str = z.string();
const n = z.coerce.number();
const strN = z.string().nullable().default(null);

export const MAX_CLIPS = 12;
export const MAX_STEPS = 10;
export const FIRST_STEP = "Crea un proyecto 9:16 e importa los clips en este orden";
export const FONT_STEP = "Importa tu tipografía: Texto → Fuente → Importar";
export const LAST_STEP = "Exporta en 1080p";

export const recipeSchema = z
  .object({
    skill_version: str.optional(),
    modo: str.default("receta_capcut"),
    duracion_sugerida_s: n.default(0),
    idea: str.default(""),
    clips_descartados: z.array(z.object({ clip_id: str, porque: str.default("") }).passthrough()).default([]),
    pasos: z.array(z.object({ numero: n.default(0), clip_id: strN, desde_s: n.default(0), hasta_s: n.default(0), accion: str, texto_pantalla: strN }).passthrough()).default([]),
    estilo_textos: z.object({ fuente: str.default(""), color_texto: str.default("#FFFFFF"), color_detalle: str.default("#FE6807"), si_no_esta_la_fuente: str.default("") }).passthrough().default({ fuente: "", color_texto: "#FFFFFF", color_detalle: "#FE6807", si_no_esta_la_fuente: "" }),
    subtitulos: strN,
    sugerencia_audio: str.default(""),
    resumen: z.array(str).default([]),
    botones: z.array(str).default([]),
  })
  .passthrough();
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeClip = { id: string; seconds: number; hasVoice: boolean };

const words = (s: string, max: number) => s.split(/\s+/).filter(Boolean).slice(0, max).join(" ");

/**
 * Reglas por código (12 a 14 de la skill): máximo 10 pasos, el primero y el último son fijos, la fuente es la del kit y se explica
 * cómo importarla, los tiempos caen dentro de cada clip y no se inventan clips. La IA propone; esto garantiza la forma.
 */
export function shapeRecipe(r: Recipe, clips: RecipeClip[], kit: { titleFont: string; textColor: string; detailColor: string }): Recipe {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const middle = r.pasos
    .filter((p) => p.accion.trim() && p.accion.trim() !== FIRST_STEP && p.accion.trim() !== LAST_STEP && !/^exporta/i.test(p.accion.trim()) && !/^crea un proyecto/i.test(p.accion.trim()))
    .filter((p) => !p.clip_id || byId.has(p.clip_id))
    .map((p) => {
      const clip = p.clip_id ? byId.get(p.clip_id)! : null;
      const from = clip ? Math.min(Math.max(0, p.desde_s), Math.max(0, clip.seconds - 0.5)) : 0;
      const to = clip ? Math.min(clip.seconds, Math.max(from + 0.5, p.hasta_s)) : 0;
      return { ...p, desde_s: Math.round(from * 10) / 10, hasta_s: Math.round(to * 10) / 10, accion: words(p.accion, 18), texto_pantalla: p.texto_pantalla ? words(p.texto_pantalla, 8) : null };
    });
  const needsFont = middle.some((p) => p.texto_pantalla) || Boolean(r.subtitulos);
  const steps = [
    { numero: 0, clip_id: null, desde_s: 0, hasta_s: 0, accion: FIRST_STEP, texto_pantalla: null },
    ...(needsFont && !middle.some((p) => /fuente/i.test(p.accion)) ? [{ numero: 0, clip_id: null, desde_s: 0, hasta_s: 0, accion: FONT_STEP, texto_pantalla: null }] : []),
    ...middle.slice(0, MAX_STEPS - 2 - (needsFont ? 1 : 0)),
    { numero: 0, clip_id: null, desde_s: 0, hasta_s: 0, accion: LAST_STEP, texto_pantalla: null },
  ].map((p, i) => ({ ...p, numero: i + 1 }));
  const duration = middle.reduce((s, p) => s + Math.max(0, p.hasta_s - p.desde_s), 0);
  return {
    ...r,
    modo: "receta_capcut",
    pasos: steps,
    clips_descartados: r.clips_descartados.filter((c) => byId.has(c.clip_id)),
    duracion_sugerida_s: Math.round(duration || r.duracion_sugerida_s),
    estilo_textos: { ...r.estilo_textos, fuente: kit.titleFont, color_texto: kit.textColor, color_detalle: kit.detailColor },
    subtitulos: clips.some((c) => c.hasVoice) ? (r.subtitulos ?? "Usa «Subtítulos automáticos» con los colores de tu kit y revisa que el nombre de tu marca esté bien escrito.") : null,
    resumen: r.resumen.slice(0, 4),
    botones: ["Ya lo edité, a mis textos", "Pedir un cambio"],
  };
}

/** Receta por reglas (sin IA): usa las tomas en el orden en que se subieron, con tramos cortos. */
export function mockRecipe(clips: RecipeClip[], ctx: { topic: string; hook: string; cta: string }): Recipe {
  const usable = clips.slice(0, 6);
  const pasos = usable.map((c, i) => {
    const len = Math.min(3, Math.max(1.5, c.seconds));
    return {
      numero: 0,
      clip_id: c.id,
      desde_s: 0,
      hasta_s: len,
      accion: `Dividir ${i === 0 ? "y deja" : "y pega"} los primeros ${len.toFixed(1)} s de la toma ${i + 1}${i > 0 ? " después de la anterior" : ""}`,
      texto_pantalla: i === 0 ? words(ctx.hook || ctx.topic, 8) : i === usable.length - 1 && ctx.cta ? words(ctx.cta, 8) : null,
    };
  });
  return recipeSchema.parse({
    skill_version: "edicion-v1",
    modo: "receta_capcut",
    idea: `Un video corto sobre «${words(ctx.topic, 8)}» con tus tomas en orden.`,
    clips_descartados: [],
    pasos,
    estilo_textos: {},
    subtitulos: null,
    sugerencia_audio: "Si quieres música, busca algo suave y sin letra al publicar.",
    resumen: ["Usé tus tomas en el orden en que las subiste", "Puse tu gancho como texto al inicio", "Esta es una receta de ejemplo hecha con reglas"],
    botones: [],
  });
}
