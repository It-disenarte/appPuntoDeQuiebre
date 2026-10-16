// Esquemas del kit visual (skill kit-visual-v1 de Mishell). Los campos no se renombran entre versiones; solo se agregan.
import { z } from "zod";
import { contrastRatio, HEX, MIN_CONTRAST, normHex } from "./contrast";
import { textFont, titleFont } from "./fonts";

const hex = z.string().regex(HEX, "Color inválido").transform(normHex);
const str = z.string();

export const coloresSchema = z.object({ principal: hex, acento: hex, fondo: hex, texto: hex });
export type Colores = z.infer<typeof coloresSchema>;

/* ───────────── Rondas 1 y 2 (paletas) ───────────── */

export const paletteOptionSchema = z.object({ id: str, nombre: str, porque: str.default(""), colores: coloresSchema }).passthrough();
export type PaletteOption = z.infer<typeof paletteOptionSchema>;
export const paletteRoundSchema = z.object({ skill_version: str.optional(), ronda: z.number().optional(), opciones: z.array(paletteOptionSchema).min(1).max(6) }).passthrough();

/* ───────────── Ronda 3 (tipografías) ───────────── */

export const fontOptionSchema = z.object({ id: str, nombre: str.default(""), titulos: str, texto: str, porque: str.default("") }).passthrough();
export type FontOption = z.infer<typeof fontOptionSchema>;
export const fontRoundSchema = z.object({ skill_version: str.optional(), ronda: z.number().optional(), opciones: z.array(fontOptionSchema).min(1).max(6) }).passthrough();

/* ───────────── Ronda 4 (estilo de títulos) ───────────── */

export const BOXES = ["ninguna", "solida", "translucida", "banda"] as const;
export const HIGHLIGHTS = ["ninguno", "marcador", "palabra_grande", "linea"] as const;
export const titleOptionSchema = z
  .object({
    id: str,
    nombre: str.default(""),
    mayusculas: z.boolean().default(false),
    caja: z.enum(BOXES).default("ninguna"),
    alineacion: z.enum(["centro", "izquierda"]).default("centro"),
    resaltado: z.enum(HIGHLIGHTS).default("ninguno"),
  })
  .passthrough();
export type TitleOption = z.infer<typeof titleOptionSchema>;
export const titleRoundSchema = z.object({ skill_version: str.optional(), ronda: z.number().optional(), opciones: z.array(titleOptionSchema).min(1).max(6) }).passthrough();

/* ───────────── Elementos (ronda 5, biblioteca fija) ───────────── */

export const ELEMENTS = [
  { id: "onda", label: "Onda" },
  { id: "destello", label: "Destello" },
  { id: "linea", label: "Línea" },
  { id: "circulo", label: "Círculo" },
  { id: "etiqueta_serie", label: "Etiqueta de serie" },
  { id: "flecha", label: "Flecha" },
  { id: "subrayado", label: "Subrayado" },
  { id: "estrella", label: "Estrella" },
] as const;
export type ElementId = (typeof ELEMENTS)[number]["id"];
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id) as [ElementId, ...ElementId[]];
export const MAX_ELEMENTS = 2;

/* ───────────── Kit final ───────────── */

export const PIECES = [
  { id: "carrusel_foto_con_bloque", label: "Portada de carrusel con foto" },
  { id: "carrusel_solida", label: "Portada de carrusel de color" },
  { id: "reel_gancho", label: "Portada de reel (gancho)" },
  { id: "reel_reflexion", label: "Portada de reel (reflexión)" },
] as const;
export type PieceId = (typeof PIECES)[number]["id"];
export const PIECE_IDS = PIECES.map((p) => p.id) as [PieceId, ...PieceId[]];
export const VOTE_REASONS = [
  { id: "colores", label: "Colores" },
  { id: "letra", label: "Letra" },
  { id: "foto", label: "Foto" },
  { id: "texto", label: "Texto" },
  { id: "acomodo", label: "Acomodo" },
  { id: "elementos", label: "Elementos" },
] as const;
export const MAX_PIECE_ADJUSTMENTS = 3;

export const finalKitSchema = z
  .object({
    skill_version: str.optional(),
    colores: coloresSchema,
    tipografias: z.object({ titulos: z.object({ familia: str, peso: z.number().default(400) }), texto: z.object({ familia: str, peso: z.number().default(400) }) }),
    titulos_video: z
      .array(
        z
          .object({
            estilo: str.default(""),
            uso: str.default("todos"),
            mayusculas: z.boolean().default(false),
            alineacion: z.enum(["centro", "izquierda"]).default("centro"),
            caja: z.enum(BOXES).default("ninguna"),
            resaltado: z.enum(HIGHLIGHTS).default("ninguno"),
            color_texto: hex,
            color_detalle: hex.nullable().default(null),
          })
          .passthrough(),
      )
      .min(1)
      .max(2),
    subtitulos: z.object({ color_texto: hex, color_resaltado: hex, posicion: z.enum(["centro", "inferior"]).default("inferior"), palabras_por_linea: z.number().int().min(1).max(6).default(3) }).passthrough(),
    elementos: z.array(z.object({ id: z.enum(ELEMENT_IDS), color: hex }).passthrough()).max(3).default([]),
    carrusel: z
      .object({
        estilos_portada: z.array(z.enum(["solida", "foto_con_bloque", "foto_completa"])).min(1),
        fondo_portada: hex,
        color_titulo_portada: hex,
        color_bloque_foto: hex,
        fondo_interiores: hex,
      })
      .passthrough(),
    preferencias_visuales: z.array(z.object({ sobre: str, le_gusta: z.boolean(), detalle: str.default("") }).passthrough()).default([]),
    mensaje_al_creador: str.default(""),
  })
  .passthrough();
export type FinalKit = z.infer<typeof finalKitSchema>;

/* ───────────── Validaciones por código (reglas 5 y 6 de la skill) ───────────── */

/** Descarta las paletas donde el texto no se lee sobre el fondo (mínimo 4.5:1). */
export function keepReadablePalettes(options: PaletteOption[]): PaletteOption[] {
  return options.filter((o) => contrastRatio(o.colores.texto, o.colores.fondo) >= MIN_CONTRAST);
}

/** Deja solo los pares con tipografías de la lista permitida (título: cualquiera; texto: las legibles). */
export function keepAllowedFonts(options: FontOption[]): FontOption[] {
  const out: FontOption[] = [];
  for (const o of options) {
    const t = titleFont(o.titulos);
    const x = textFont(o.texto);
    if (t && x && t !== x) out.push({ ...o, titulos: t, texto: x });
  }
  return out;
}

/** Valida el kit final: tipografías permitidas y contraste del texto y de los títulos. */
export function checkFinalKit(kit: FinalKit): { ok: true; kit: FinalKit } | { ok: false; reason: string } {
  const t = titleFont(kit.tipografias.titulos.familia);
  const x = textFont(kit.tipografias.texto.familia);
  if (!t || !x) return { ok: false, reason: "tipografía fuera de la lista permitida" };
  if (contrastRatio(kit.colores.texto, kit.colores.fondo) < MIN_CONTRAST) return { ok: false, reason: "el texto no se lee sobre el fondo" };
  if (contrastRatio(kit.carrusel.color_titulo_portada, kit.carrusel.fondo_portada) < MIN_CONTRAST) return { ok: false, reason: "el título de la portada no se lee" };
  return { ok: true, kit: { ...kit, tipografias: { titulos: { ...kit.tipografias.titulos, familia: t }, texto: { ...kit.tipografias.texto, familia: x } } } };
}
