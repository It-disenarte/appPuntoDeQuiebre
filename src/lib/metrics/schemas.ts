// Métricas del creador leídas de capturas de pantalla (mientras no esté la API de Instagram).
import { z } from "zod";

const num = z.number().finite().nullable().optional();
const pct = z.number().min(0).max(100).nullable().optional();

export const cuentaSchema = z
  .object({
    vistas: num,
    alcance: num,
    interacciones: num,
    visitas_perfil: num,
    seguidores_total: num,
    seguidores_nuevos: num,
    dejaron_de_seguir: num,
    pct_vistas_seguidores: pct,
    pct_vistas_no_seguidores: pct,
    pct_por_tipo: z.object({ reels: pct, historias: pct, publicaciones: pct }).partial().nullable().optional(),
    me_gusta: num,
    comentarios: num,
    guardados: num,
    compartidos: num,
  })
  .passthrough();
export type Cuenta = z.infer<typeof cuentaSchema>;

export const extractedSchema = z
  .object({
    skill_version: z.string().optional(),
    periodo: z.object({ etiqueta: z.string().default(""), desde: z.string().nullable().optional(), hasta: z.string().nullable().optional() }).passthrough().default({ etiqueta: "" }),
    cuenta: cuentaSchema.default({}),
    audiencia: z
      .object({ edades: z.record(z.string(), z.number()).optional(), genero: z.object({ mujeres: num, hombres: num }).partial().optional(), ciudades: z.array(z.string()).optional(), horas_mas_activas: z.array(z.number()).optional() })
      .passthrough()
      .nullable()
      .optional(),
    publicaciones_top: z
      .array(z.object({ descripcion: z.string().default(""), tipo: z.string().nullable().optional(), vistas: num, me_gusta: num, guardados: num, compartidos: num, comentarios: num }).passthrough())
      .default([]),
    notas_lectura: z.array(z.string()).default([]),
    confianza: z.enum(["alta", "media", "baja"]).default("media"),
  })
  .passthrough();
export type Extracted = z.infer<typeof extractedSchema>;

/** Cifras que el creador confirma o corrige antes de que se expliquen. */
export const KEY_FIELDS = [
  { id: "vistas", label: "Vistas", hint: "Total de veces que se vio tu contenido", pct: false },
  { id: "alcance", label: "Cuentas alcanzadas", hint: "Personas distintas que te vieron", pct: false },
  { id: "interacciones", label: "Interacciones", hint: "Me gusta, comentarios, guardados y compartidos", pct: false },
  { id: "guardados", label: "Guardados", hint: "Veces que guardaron tus publicaciones", pct: false },
  { id: "seguidores_total", label: "Seguidores", hint: "Total al final del periodo", pct: false },
  { id: "seguidores_nuevos", label: "Seguidores nuevos", hint: "Los que ganaste en el periodo", pct: false },
  { id: "pct_vistas_no_seguidores", label: "Vistas de gente que no te sigue (%)", hint: "Mientras más alto, más llegas a gente nueva", pct: true },
] as const;
export type KeyField = (typeof KEY_FIELDS)[number]["id"];

export const confirmedSchema = z.object({ periodo: z.string(), cuenta: cuentaSchema, edited: z.array(z.string()).default([]) });
export type Confirmed = z.infer<typeof confirmedSchema>;

/* ───────────── Explicación ───────────── */

export const TONES = ["sube", "baja", "igual", "nuevo"] as const;
export const indicatorSchema = z.object({
  id: z.string(),
  etiqueta: z.string(),
  valor: z.string(),
  cambio_pct: z.number().nullable().default(null),
  tono: z.enum(TONES),
  explicacion: z.string().default(""),
});
export const explanationSchema = z
  .object({
    skill_version: z.string().optional(),
    resumen: z.string(),
    indicadores: z.array(indicatorSchema).min(1).max(8),
    hallazgos: z.array(z.object({ texto: z.string(), tipo: z.enum(["dato", "hipotesis"]) })).default([]),
    para_la_parrilla: z.array(z.string()).default([]),
    siguiente_paso: z.string().default(""),
    mensaje: z.string().default(""),
  })
  .passthrough();
export type Explanation = z.infer<typeof explanationSchema>;

/* ───────────── Comparación contra el mes anterior ───────────── */

export type Change = { campo: string; actual: number; anterior: number; cambio_pct: number };

const val = (c: Cuenta | undefined | null, f: string): number | null => {
  const v = (c as Record<string, unknown> | null | undefined)?.[f];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** Cambio porcentual de cada cifra clave contra el mes anterior (solo si existen en los dos). */
export function compareMetrics(prev: Cuenta | null | undefined, cur: Cuenta): Change[] {
  const out: Change[] = [];
  for (const f of KEY_FIELDS) {
    const a = val(cur, f.id);
    const b = val(prev, f.id);
    if (a === null || b === null) continue;
    out.push({ campo: f.id, actual: a, anterior: b, cambio_pct: b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / b) * 1000) / 10 });
  }
  return out;
}

export const formatCount = (n: number) => new Intl.NumberFormat("es-MX", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

export const toneOf = (change: number | null): (typeof TONES)[number] => (change === null ? "nuevo" : Math.abs(change) < 2 ? "igual" : change > 0 ? "sube" : "baja");

/** Indicadores principales calculados en código (los números nunca los inventa la IA). */
export function buildIndicators(cur: Cuenta, changes: Change[]): z.infer<typeof indicatorSchema>[] {
  const by = new Map(changes.map((c) => [c.campo, c]));
  const out: z.infer<typeof indicatorSchema>[] = [];
  for (const f of KEY_FIELDS) {
    const v = val(cur, f.id);
    if (v === null) continue;
    const ch = by.get(f.id)?.cambio_pct ?? null;
    out.push({ id: f.id === "pct_vistas_no_seguidores" ? "no_seguidores" : f.id, etiqueta: f.label.replace(/ \(%\)$/, ""), valor: f.pct ? `${Math.round(v)} %` : formatCount(v), cambio_pct: ch, tono: toneOf(ch), explicacion: "" });
  }
  return out.slice(0, 7);
}

/* ───────────── Datos de ejemplo (sin IA) ───────────── */

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

/** Lectura de EJEMPLO cuando no hay Gemini: sirve para conocer el proceso; no refleja las capturas. */
export function sampleExtraction(seed: string, period: string): Extracted {
  const h = hash(seed + period);
  const r = (min: number, max: number, k: number) => min + ((h >> k) % (max - min));
  const vistas = r(3000, 40000, 3);
  return extractedSchema.parse({
    skill_version: "metricas-capturas-v1",
    periodo: { etiqueta: `Periodo ${period} (datos de ejemplo)` },
    cuenta: {
      vistas,
      alcance: Math.round(vistas * 0.55),
      interacciones: Math.round(vistas * 0.06),
      visitas_perfil: r(100, 900, 5),
      seguidores_total: r(300, 5000, 7),
      seguidores_nuevos: r(5, 120, 9),
      dejaron_de_seguir: r(0, 20, 11),
      pct_vistas_seguidores: 70,
      pct_vistas_no_seguidores: 30,
      pct_por_tipo: { reels: 55, historias: 35, publicaciones: 10 },
      guardados: r(10, 200, 13),
    },
    notas_lectura: ["Estas cifras son de ejemplo: todavía no hay lectura real de capturas."],
    confianza: "baja",
  });
}
