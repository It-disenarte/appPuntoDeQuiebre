// Reglas del motor de la parrilla semanal (guía de Luis: "Planes y reglas del motor"). Corren en código, sin gastar IA.
export type Category = "viral" | "nicho" | "conversion";
export type Stage = "arranque" | "crecimiento" | "monetizacion";
export type PlanId = "basico" | "pro";
export type Mix = Record<Category, number>;

export const CATEGORY_LABEL: Record<Category, string> = { viral: "Viral", nicho: "Nicho", conversion: "Conversión" };
export const STAGE_LABEL: Record<Stage, string> = { arranque: "Arranque", crecimiento: "Crecimiento", monetizacion: "Monetización" };

/** Etapa del creador: arranque = primeros 2 meses o menos de 1,000 seguidores; monetización = más de 10,000. */
export function stageFor(opts: { followers?: number | null; accountAgeDays: number }): Stage {
  const f = opts.followers ?? null;
  if (opts.accountAgeDays <= 60) return "arranque";
  if (f === null) return "arranque";
  if (f > 10_000) return "monetizacion";
  if (f >= 1_000) return "crecimiento";
  return "arranque";
}

/** Mezcla por categoría (regla 1). Sin nada que vender no hay conversión: 50/50/0. */
export function mixFor(stage: Stage, hasOffer: boolean): Mix {
  if (!hasOffer) return { viral: 50, nicho: 50, conversion: 0 };
  if (stage === "crecimiento") return { viral: 40, nicho: 40, conversion: 20 };
  if (stage === "monetizacion") return { viral: 30, nicho: 40, conversion: 30 };
  return { viral: 50, nicho: 40, conversion: 10 };
}

/** Reparte `n` piezas según los porcentajes (método del resto mayor: la suma siempre es n). */
export function allocate(n: number, mix: Mix): Record<Category, number> {
  const cats: Category[] = ["viral", "nicho", "conversion"];
  const raw = cats.map((c) => ({ c, v: (n * mix[c]) / 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.c, Math.floor(r.v)])) as Record<Category, number>;
  let left = n - cats.reduce((s, c) => s + out[c], 0);
  for (const r of [...raw].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))) {
    if (left <= 0) break;
    if (mix[r.c] > 0) {
      out[r.c] += 1;
      left -= 1;
    }
  }
  return out;
}

/** Ajusta la mezcla con lo aprendido: se mueve como máximo 10 puntos y la conversión nunca pasa de 35 % (regla 6). */
export function adjustMix(base: Mix, wanted: Mix): Mix {
  const clamp = (c: Category) => Math.max(base[c] - 10, Math.min(base[c] + 10, wanted[c]));
  const out = { viral: clamp("viral"), nicho: clamp("nicho"), conversion: Math.min(35, clamp("conversion")) };
  const total = out.viral + out.nicho + out.conversion;
  return total === 100 ? out : { ...out, nicho: out.nicho + (100 - total) };
}

/* ───────────── Fechas (zona de la Ciudad de México) ───────────── */

export const TZ = "America/Mexico_City";

/** Fecha de hoy en formato AAAA-MM-DD en la zona del creador. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(new Date(toUtc(iso).getTime() + n * 86_400_000));
/** 0 = lunes … 6 = domingo. */
export const dowMon0 = (iso: string) => (toUtc(iso).getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => addDays(iso, -dowMon0(iso));

/** Semana que se arma: la actual si hoy es lunes a miércoles; si no, la siguiente. */
export function targetWeek(today = todayIso()): string {
  const monday = mondayOf(today);
  return dowMon0(today) <= 2 ? monday : addDays(monday, 7);
}

export const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const DAY_CODES = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** Número de semana ISO (para alternar el tipo de prueba). */
export function isoWeekNumber(iso: string): number {
  const d = toUtc(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/* ───────────── Espacios de la semana ───────────── */

export type Kind = "video" | "carrusel";
export type TestKind = "gancho" | "angulo";
export type Slot = {
  n: number;
  day: string;
  dow: (typeof DAY_CODES)[number];
  kind: Kind;
  category: Category;
  type: "probado" | "prueba";
  /** Solo en la variante: número de la pieza que se repite con otro gancho o ángulo. */
  variantOf: number | null;
  testKind: TestKind | null;
};

/**
 * Patrón de la semana (L a D). Básico: 4 videos (3 distintos + 1 variante de prueba) y 3 carruseles.
 * Pro: 5 videos (4 distintos + 1 variante) y 2 carruseles. El domingo es siempre la variante.
 */
const PATTERN: Record<PlanId, Kind[]> = {
  basico: ["video", "carrusel", "video", "carrusel", "video", "carrusel", "video"],
  pro: ["video", "carrusel", "video", "video", "carrusel", "video", "video"],
};

export function planSlots(opts: { plan: PlanId; weekStart: string; mix: Mix }): Slot[] {
  const kinds = PATTERN[opts.plan];
  const testKind: TestKind = isoWeekNumber(opts.weekStart) % 2 === 0 ? "gancho" : "angulo";
  const distinct = kinds.slice(0, 6); // el domingo (7.º) es la variante
  const counts = allocate(distinct.length, opts.mix);

  // Viral primero en videos, conversión al final en carruseles, el resto es nicho.
  const order = distinct.map((k, i) => ({ i, k }));
  const videos = order.filter((o) => o.k === "video").map((o) => o.i);
  const carousels = order.filter((o) => o.k === "carrusel").map((o) => o.i);
  const cat: Category[] = distinct.map(() => "nicho");
  const takeFrom = (pool: number[], from: "start" | "end") => (from === "start" ? pool.find((i) => cat[i] === "nicho") : [...pool].reverse().find((i) => cat[i] === "nicho"));
  for (let v = 0; v < counts.viral; v++) {
    const i = takeFrom(videos, "start") ?? takeFrom(carousels, "start");
    if (i !== undefined) cat[i] = "viral";
  }
  for (let c = 0; c < counts.conversion; c++) {
    const i = takeFrom(carousels, "end") ?? takeFrom(videos, "end");
    if (i !== undefined) cat[i] = "conversion";
  }

  const slots: Slot[] = distinct.map((kind, i) => ({
    n: i + 1,
    day: addDays(opts.weekStart, i),
    dow: DAY_CODES[i]!,
    kind,
    category: cat[i]!,
    type: "probado",
    variantOf: null,
    testKind: null,
  }));
  // La variante de prueba repite el video viral de más alcance (o el primer video si no hay viral).
  const base = slots.find((s) => s.kind === "video" && s.category === "viral") ?? slots.find((s) => s.kind === "video")!;
  slots.push({ n: 7, day: addDays(opts.weekStart, 6), dow: "D", kind: "video", category: base.category, type: "prueba", variantOf: base.n, testKind });
  return slots;
}

/** Cuántas piezas de cada categoría hay en la semana (sin contar la variante). */
export function categoryCounts(slots: Slot[]): Record<Category, number> {
  const out: Record<Category, number> = { viral: 0, nicho: 0, conversion: 0 };
  for (const s of slots) if (s.variantOf === null) out[s.category] += 1;
  return out;
}

/** Modo de los textos: aprendizaje las primeras 10 piezas; rápido después (y vuelve a aprendizaje si edita 3 de las últimas 5). */
export function textMode(piecesWithTexts: number, recentEdits: boolean[]): "aprendizaje" | "rapido" {
  if (piecesWithTexts < 10) return "aprendizaje";
  const last5 = recentEdits.slice(-5);
  return last5.filter(Boolean).length >= 3 ? "aprendizaje" : "rapido";
}

/** Tipos de historia que no se pueden repetir dos días seguidos (regla 6 de la skill 7). */
export function noBackToBack(types: string[]): boolean {
  return types.every((t, i) => i === 0 || t !== types[i - 1]);
}
