// Línea de tiempo de la edición (pura, sin ffmpeg): qué se queda, cómo se recorren los tiempos y las expresiones de acercamiento.
import { CUT_MARGIN_S, MAX_FINAL_SECONDS, type Overrides, type Plan } from "./schemas";

export type Range = { a: number; b: number };
export type Segment = Range & { offset: number; tramo?: number; silent?: boolean };

/** Cortes que SÍ se aplican: se quitan los restaurados y cada uno se achica 0.05 s por lado para no comerse sílabas. */
export function activeCuts(cortes: Plan["cortes"], restored: number[], margin = CUT_MARGIN_S): Range[] {
  const skip = new Set(restored);
  const out: Range[] = [];
  cortes.forEach((c, i) => {
    if (skip.has(i)) return;
    const a = c.inicio_s + margin;
    const b = c.fin_s - margin;
    if (b - a > 0.02) out.push({ a, b });
  });
  out.sort((x, y) => x.a - y.a);
  const merged: Range[] = [];
  for (const r of out) {
    const last = merged.at(-1);
    if (last && r.a <= last.b) last.b = Math.max(last.b, r.b);
    else merged.push({ ...r });
  }
  return merged;
}

/** Pedazos del video que se conservan (el original menos los cortes), con su posición en el video editado. */
export function keepSegments(duration: number, cuts: Range[]): Segment[] {
  const segs: Segment[] = [];
  let cursor = 0;
  let offset = 0;
  for (const c of cuts) {
    if (c.a > cursor + 0.01) {
      segs.push({ a: cursor, b: c.a, offset });
      offset += c.a - cursor;
    }
    cursor = Math.max(cursor, c.b);
  }
  if (duration > cursor + 0.01) segs.push({ a: cursor, b: duration, offset });
  return segs;
}

/** Pedazos de un tramo (modo mixto). Sin tramo se usan todos. */
export const segsFor = (segs: Segment[], tramo?: number) => (tramo === undefined ? segs : segs.filter((s) => s.tramo === tramo));

/**
 * Línea de tiempo del modo mixto: los tramos en el orden que pidió la IA (pueden repetir un pedazo, el gancho prestado). Lo que se
 * corta por privacidad se resta de cada tramo. Los apoyos con audio en silencio se marcan para quitarles el sonido.
 */
export function mixtoSegments(plan: Plan, duration: number): Segment[] {
  const cuts = plan.privacidad
    .filter((p) => p.accion === "cortar")
    .map((p) => ({ a: p.inicio_s, b: p.fin_s }))
    .sort((x, y) => x.a - y.a);
  const out: Segment[] = [];
  let offset = 0;
  for (const l of plan.linea_de_tiempo) {
    const lo = Math.max(0, l.inicio_s);
    const hi = Math.min(duration, l.fin_s);
    if (hi - lo < 0.1) continue;
    const inside = cuts.filter((c) => c.b > lo && c.a < hi).map((c) => ({ a: Math.max(c.a, lo), b: Math.min(c.b, hi) }));
    // El tramo menos lo que se corta por privacidad.
    const parts: Range[] = [];
    let cursor = lo;
    for (const c of inside) {
      if (c.a > cursor + 0.02) parts.push({ a: cursor, b: c.a });
      cursor = Math.max(cursor, c.b);
    }
    if (hi > cursor + 0.02) parts.push({ a: cursor, b: hi });
    for (const s of parts) {
      if (s.b - s.a < 0.1) continue;
      out.push({ a: s.a, b: s.b, offset, tramo: l.tramo, silent: l.audio === "silencio" });
      offset += s.b - s.a;
    }
  }
  return out;
}

/** Segmentos de un plan según su modo: a cámara (original menos cortes) o mixto (la línea de tiempo). */
export function planSegments(plan: Plan, overrides: Overrides, duration: number): Segment[] {
  if (plan.modo === "mixto" && plan.linea_de_tiempo.length > 0) return mixtoSegments(plan, duration);
  return keepSegments(duration, activeCuts(plan.cortes, overrides.restored));
}

/** Rangos del video editado que se difuminan por privacidad (modo mixto). */
export function blurRanges(plan: Plan, segs: Segment[]): Range[] {
  return plan.privacidad.filter((p) => p.accion === "difuminar").flatMap((p) => mapRange(p.inicio_s, p.fin_s, segs));
}

export const editedDuration = (segs: Segment[]) => segs.reduce((s, x) => s + (x.b - x.a), 0);

/** Parte(s) de un rango del video original que siguen en el video editado, ya con los tiempos nuevos. */
export function mapRange(a: number, b: number, segs: Segment[]): Range[] {
  const out: Range[] = [];
  for (const s of segs) {
    const lo = Math.max(a, s.a);
    const hi = Math.min(b, s.b);
    if (hi - lo > 0.02) out.push({ a: s.offset + (lo - s.a), b: s.offset + (hi - s.a) });
  }
  // Si quedaron pedazos pegados por un corte muy corto, se unen para no parpadear.
  const merged: Range[] = [];
  for (const r of out) {
    const last = merged.at(-1);
    if (last && r.a - last.b < 0.08) last.b = r.b;
    else merged.push({ ...r });
  }
  return merged;
}

/** Tiempo del video editado que corresponde a un segundo del original (o el más cercano si cae dentro de un corte). */
export function mapPoint(t: number, segs: Segment[]): number {
  for (const s of segs) if (t >= s.a && t <= s.b) return s.offset + (t - s.a);
  let best = 0;
  for (const s of segs) if (s.b <= t) best = s.offset + (s.b - s.a);
  return best;
}

/* ───────────── Acercamientos ───────────── */

export const PLANO_ZOOM = { normal: 1, cercano: 1.2, muy_cercano: 1.35 } as const;
const f = (x: number) => (Math.round(x * 1000) / 1000).toString();

/**
 * Expresión de ffmpeg para el factor de acercamiento según el tiempo `t` del video editado: 1 + suma de tramos, cada uno con
 * entrada y salida suaves. Los planos usan 0.25 s de transición; el “golpe” 0.1 s; el acercamiento suave 0.6 s.
 */
export function zoomExpression(plan: Plan, segs: Segment[], lowRes = false): string {
  const terms: string[] = [];
  const cap = lowRes ? 1.15 : 1.4;
  const add = (r: Range, extra: number, ramp: number) => {
    if (r.b - r.a < 0.05 || extra <= 0) return;
    const rp = Math.min(ramp, (r.b - r.a) / 2);
    terms.push(`${f(extra)}*min(clip((t-${f(r.a)})/${f(rp)},0,1),clip((${f(r.b)}-t)/${f(rp)},0,1))`);
  };
  for (const e of plan.encuadres) for (const r of mapRange(e.inicio_s, e.fin_s, segsFor(segs, e.tramo))) add(r, Math.min(PLANO_ZOOM[e.plano], 1 + (cap - 1)) - 1, 0.25);
  for (const z of plan.zooms) for (const r of mapRange(z.inicio_s, z.fin_s, segsFor(segs, z.tramo))) add(r, z.tipo === "golpe" ? 0.12 : 0.08, z.tipo === "golpe" ? 0.1 : 0.6);
  if (terms.length === 0) return "1";
  return `min(${f(cap)},1+${terms.join("+")})`;
}

/* ───────────── Subtítulos y textos (ASS) ───────────── */

export type AssStyleKit = {
  titleFont: string;
  textFont: string;
  textColor: string;
  highlightColor: string;
  titleColor: string;
  detailColor: string;
  boxColor: string | null;
  uppercase: boolean;
};

const hex2ass = (c: string, alpha = 0) => {
  const h = c.replace("#", "").padStart(6, "0");
  const aa = alpha.toString(16).padStart(2, "0").toUpperCase();
  return `&H${aa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
/** Color para un cambio dentro del texto (`{\c&HBBGGRR&}`): 6 dígitos y un & al final. */
const inlineColor = (c: string) => {
  const h = c.replace("#", "").padStart(6, "0");
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
};
const ts = (s: number) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};
const clean = (s: string) => s.replace(/[{}\\]/g, "").replace(/\r?\n/g, "\\N").trim();

function highlight(text: string, words: string[], hiHex: string, baseHex: string): string {
  const hi = inlineColor(hiHex);
  const base = inlineColor(baseHex);
  const out = clean(text);
  const w = words.find((x) => x.trim() && out.toLowerCase().includes(x.trim().toLowerCase()));
  if (!w) return out;
  const i = out.toLowerCase().indexOf(w.trim().toLowerCase());
  return `${out.slice(0, i)}{\\c${hi}}${out.slice(i, i + w.length)}{\\c${base}}${out.slice(i + w.length)}`;
}

export type AssInput = {
  plan: Plan;
  overrides: Overrides;
  segs: Segment[];
  kit: AssStyleKit;
  width?: number;
  height?: number;
};

/**
 * Archivo ASS con los subtítulos y los textos en pantalla, con los tiempos ya recorridos. Respeta la zona segura de 9:16
 * (libres 12 % arriba y 20 % abajo). Los subtítulos que dicen lo mismo que el gancho se ocultan mientras el gancho está en pantalla.
 */
export function buildAss({ plan, overrides, segs, kit, width = 1080, height = 1920 }: AssInput): string {
  const top = Math.round(height * 0.13);
  const bottom = Math.round(height * 0.23);
  const sub = hex2ass(kit.textColor);
  const ttl = hex2ass(kit.titleColor);
  const box = kit.boxColor ? hex2ass(kit.boxColor) : hex2ass("#000000", 160);
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Sub,${kit.textFont},62,${sub},${sub},${hex2ass("#000000", 40)},${hex2ass("#000000", 120)},0,0,0,0,100,100,0,0,1,5,2,2,70,70,${bottom},1`,
    `Style: Hook,${kit.titleFont},88,${ttl},${ttl},${hex2ass("#000000", 40)},${box},0,0,0,0,100,100,0,0,${kit.boxColor ? 3 : 1},${kit.boxColor ? 18 : 6},0,8,70,70,${top},1`,
    `Style: Section,${kit.titleFont},70,${ttl},${ttl},${hex2ass("#000000", 40)},${box},0,0,0,0,100,100,0,0,${kit.boxColor ? 3 : 1},${kit.boxColor ? 14 : 5},0,8,70,70,${top},1`,
    `Style: Cta,${kit.titleFont},74,${ttl},${ttl},${hex2ass("#000000", 40)},${box},0,0,0,0,100,100,0,0,${kit.boxColor ? 3 : 1},${kit.boxColor ? 16 : 5},0,2,70,70,${bottom + 150},1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];
  const events: string[] = [];
  const hooks: Range[] = [];

  plan.textos_pantalla.forEach((t, i) => {
    const text = overrides.titles[String(i)] ?? t.texto;
    const style = t.tipo === "gancho" ? "Hook" : t.tipo === "cta" ? "Cta" : "Section";
    for (const r of mapRange(t.inicio_s, t.fin_s, segsFor(segs, t.tramo))) {
      if (t.tipo === "gancho") hooks.push(r);
      const shown = kit.uppercase ? clean(text).toUpperCase() : clean(text);
      events.push(`Dialogue: 1,${ts(r.a)},${ts(r.b)},${style},,0,0,0,,${shown}`);
    }
  });

  plan.subtitulos.lineas.forEach((l, i) => {
    const text = overrides.subtitles[String(i)] ?? l.texto;
    for (const r of mapRange(l.inicio_s, l.fin_s, segsFor(segs, l.tramo))) {
      if (hooks.some((h) => r.a < h.b && r.b > h.a)) continue; // mientras está el gancho en pantalla no se repite en subtítulos
      events.push(`Dialogue: 0,${ts(r.a)},${ts(r.b)},Sub,,0,0,0,,${highlight(text, l.resaltar, kit.highlightColor, kit.textColor)}`);
    }
  });
  return `${[...head, ...events].join("\n")}\n`;
}

/** ASS de la portada: el título en bloque sólido dentro del centro 3:4 (para que no lo corte la cuadrícula del perfil). */
export function buildCoverAss(title: string, highlightWord: string, kit: AssStyleKit, width = 1080, height = 1920): string {
  const block = kit.boxColor ?? "#FFFFFF";
  const ink = kit.boxColor ? kit.titleColor : "#09080D";
  const side = Math.round((width - (height * 3) / 4) / 2); // 3:4 centrado: en 1080×1920 todo el ancho cabe; se deja margen
  const m = Math.max(90, side + 90);
  const base = hex2ass(ink);
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Cover,${kit.titleFont},104,${base},${base},${hex2ass(block)},${hex2ass(block)},0,0,0,0,100,100,0,0,3,34,0,2,${m},${m},${Math.round(height * 0.2)},1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    `Dialogue: 0,0:00:00.00,0:00:05.00,Cover,,0,0,0,,${highlight(kit.uppercase ? title.toUpperCase() : title, [highlightWord], kit.highlightColor, ink)}`,
    "",
  ].join("\n");
}

/* ───────────── Revisión por código ───────────── */

export type Warning = { code: "duracion" | "sin_gancho"; text: string };

/** Avisos para el creador: el video pasa de 61 s (por ejemplo, al restaurar un corte) o no trae texto de gancho. */
export function checkPlan(plan: Plan, overrides: Overrides, duration: number): { finalSeconds: number; warnings: Warning[] } {
  const segs = planSegments(plan, overrides, duration);
  const finalSeconds = editedDuration(segs);
  const warnings: Warning[] = [];
  if (finalSeconds > MAX_FINAL_SECONDS + 0.5) warnings.push({ code: "duracion", text: `El video quedaría de ${Math.round(finalSeconds)} s y pasa de ${MAX_FINAL_SECONDS} s. Quita algo o déjalo si así lo prefieres.` });
  if (!plan.textos_pantalla.some((t) => t.tipo === "gancho")) warnings.push({ code: "sin_gancho", text: "El video no trae el texto del gancho en pantalla." });
  return { finalSeconds, warnings };
}
