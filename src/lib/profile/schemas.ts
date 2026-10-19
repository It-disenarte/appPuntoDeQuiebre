// Optimización de perfil (skill 4) y calificador de foto (skill 5): entradas del creador, salidas validadas y reglas de código.
import { z } from "zod";

const str = z.string();
const strN = z.string().nullable().default(null);

export const BIO_MAX = 150;
export const NAME_MAX = 64;
export const MAX_REFRESH = 2;
export const MAX_PHOTOS = 3;

/** Lo que el creador escribe de su perfil actual (hasta conectar Instagram). */
export const currentSchema = z.object({
  usuario: z.string().trim().max(40).default(""),
  nombre: z.string().trim().max(NAME_MAX).default(""),
  biografia: z.string().trim().max(220).default(""),
  enlace: z.string().trim().max(200).nullable().default(null),
  categoria: z.string().trim().max(60).nullable().default(null),
  destacadas: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
export type Current = z.infer<typeof currentSchema>;

export const PARTS = ["nombre", "biografia", "enlace", "categoria", "destacadas"] as const;
export type ProfilePart = (typeof PARTS)[number];
export const PART_LABEL: Record<ProfilePart, string> = { nombre: "Nombre", biografia: "Biografía", enlace: "Enlace", categoria: "Categoría", destacadas: "Destacadas" };

const highlight = z
  .object({
    nombre: str,
    accion: z.enum(["mantener", "renombrar", "agregar"]).catch("agregar").default("agregar"),
    que_lleva: str.default(""),
    portada: z
      .object({ estilo: z.enum(["solida", "foto"]).catch("solida").default("solida"), fondo: str.default("#191BDF"), icono: str.default("star"), color_icono: str.default("#FFFFFF"), elemento: strN })
      .passthrough()
      .default({ estilo: "solida", fondo: "#191BDF", icono: "star", color_icono: "#FFFFFF", elemento: null }),
  })
  .passthrough();

export const profileOutput = z
  .object({
    skill_version: str.optional(),
    diagnostico: z.array(z.object({ parte: str, estado: z.enum(["bien", "mejorar", "falta"]).catch("mejorar"), por_que: str.default("") }).passthrough()).default([]),
    nombre: z.object({ opciones: z.array(str).min(1).transform((a) => a.slice(0, 8)), palabra_clave: str.default("") }).passthrough(),
    biografia: z.object({ opciones: z.array(z.object({ texto: str, caracteres: z.number().optional() }).passthrough()).min(1).transform((a) => a.slice(0, 12)), nota: str.optional() }).passthrough(),
    enlace: z.object({ recomendacion: str.default(""), por_que: str.default("") }).passthrough().default({ recomendacion: "", por_que: "" }),
    categoria: str.default(""),
    destacadas: z.array(highlight).transform((a) => a.slice(0, 7)).default([]),
    orden_de_cambios: z.array(str).default([]),
  })
  .passthrough();
export type ProfileOut = z.infer<typeof profileOutput>;
export type Highlight = z.infer<typeof highlight>;

export const photoOutput = z
  .object({
    skill_version: str.optional(),
    fotos: z
      .array(
        z
          .object({
            foto: str.default(""),
            calificacion: z.coerce.number().min(0).max(10),
            rubrica: z.object({ rostro_visible: z.coerce.number().default(0), encuadre: z.coerce.number().default(0), luz: z.coerce.number().default(0), fondo_y_marca: z.coerce.number().default(0), expresion: z.coerce.number().default(0), nitidez: z.coerce.number().default(0) }).passthrough().default({ rostro_visible: 0, encuadre: 0, luz: 0, fondo_y_marca: 0, expresion: 0, nitidez: 0 }),
            lo_que_funciona: str.default(""),
            consejos: z.array(str).default([]),
            recorte_sugerido: z.object({ centro_x: z.coerce.number().min(0).max(1).default(0.5), centro_y: z.coerce.number().min(0).max(1).default(0.4), zoom: z.coerce.number().min(1).max(3).default(1) }).passthrough().nullable().default(null),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export type PhotoOut = z.infer<typeof photoOutput>;
export type PhotoScore = PhotoOut["fotos"][number];

export const RUBRIC = [
  { id: "rostro_visible", label: "Rostro visible", max: 2 },
  { id: "encuadre", label: "Encuadre", max: 2 },
  { id: "luz", label: "Luz", max: 2 },
  { id: "fondo_y_marca", label: "Fondo y marca", max: 2 },
  { id: "expresion", label: "Expresión", max: 1 },
  { id: "nitidez", label: "Nitidez", max: 1 },
] as const;

/** La skill mide la biografía a mano; aquí se cuenta de verdad y se descartan las que se pasan de 150. */
export function cleanBios(opts: { texto: string }[]): { texto: string; caracteres: number }[] {
  const out = opts.map((o) => ({ texto: o.texto.trim(), caracteres: [...o.texto.trim()].length })).filter((o) => o.texto && o.caracteres <= BIO_MAX);
  return out;
}

/** Máx. 15 caracteres por destacada (regla 6B). */
export const cleanHighlightName = (s: string) => [...s.trim()].slice(0, 15).join("");

/** ¿El nombre lleva alguna palabra que la gente busque? (regla 10) */
export function nameHasKeyword(name: string, keywords: string[]): boolean {
  const n = name.toLowerCase();
  return keywords.some((k) => k.trim().length >= 3 && n.includes(k.toLowerCase()));
}

export const votePartSchema = z.object({ voto: z.enum(["si", "editado", "no"]), antes: z.string().max(400).optional(), despues: z.string().max(400).optional(), nota: z.string().max(300).optional() });
export type PartVote = z.infer<typeof votePartSchema>;

/** Imagen a mostrar a distintos tamaños con el recorte sugerido: devuelve el estilo CSS de fondo. */
export function cropStyle(r: { centro_x: number; centro_y: number; zoom: number } | null): { objectPosition: string; transform: string; transformOrigin: string } {
  const x = Math.round((r?.centro_x ?? 0.5) * 100);
  const y = Math.round((r?.centro_y ?? 0.5) * 100);
  return { objectPosition: `${x}% ${y}%`, transform: `scale(${r?.zoom ?? 1})`, transformOrigin: `${x}% ${y}%` };
}
