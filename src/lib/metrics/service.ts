import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getManual } from "@/lib/brujula/service";
import { claudeConfigured, claudeText } from "@/lib/ai/claude";
import { geminiConfigured, geminiGenerate, parseJson } from "@/lib/ai/gemini";
import { db } from "@/lib/db";
import { aiCalls, contentPieces, metricReports } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs";
import { normalizePhoto, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/kit/service";
import { monthName, previousPeriod } from "@/lib/notify/rules";
import { todayIso } from "@/lib/plan/rules";
import { sendToUser } from "@/lib/push";
import { deleteObject, getObject, putObjectStream, storageConfigured } from "@/lib/storage";
import { buildIndicators, compareMetrics, confirmedSchema, explanationSchema, extractedSchema, KEY_FIELDS, sampleExtraction, toneOf, type Change, type Confirmed, type Cuenta, type Explanation, type Extracted } from "./schemas";

export const MAX_SHOTS = 8;
export type Report = typeof metricReports.$inferSelect;

/* ───────────── Periodos ───────────── */

/** Mes que se reporta por defecto (el anterior) y los dos anteriores a ese. */
export function periodOptions(today = todayIso()): { period: string; label: string }[] {
  const first = previousPeriod(today);
  const second = previousPeriod(`${first}-01`);
  const third = previousPeriod(`${second}-01`);
  return [first, second, third].map((p) => ({ period: p, label: `${monthName(p)} ${p.slice(0, 4)}` }));
}
/** Primer día del mes siguiente a un periodo "AAAA-MM". */
const nextMonthStart = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/**
 * ¿Tiene sentido pedirle las métricas de ese mes? Solo si ya empezó: grabó, programó o publicó algo en ese mes.
 * (Quien apenas se registra no tiene qué medir, así que el recordatorio empieza el mes siguiente a su primera publicación.)
 */
export async function hadActivityIn(userId: string, period: string): Promise<boolean> {
  const [row] = await db()
    .select({ n: count() })
    .from(contentPieces)
    .where(and(eq(contentPieces.userId, userId), gte(contentPieces.day, `${period}-01`), lt(contentPieces.day, nextMonthStart(period)), inArray(contentPieces.status, ["grabado", "programado", "publicado"])));
  return (row?.n ?? 0) > 0;
}

export const isValidPeriod = (p: string, today = todayIso()) => periodOptions(today).some((o) => o.period === p);

/* ───────────── Lectura ───────────── */

export async function getReport(userId: string, period: string): Promise<Report | null> {
  const [r] = await db().select().from(metricReports).where(and(eq(metricReports.userId, userId), eq(metricReports.period, period))).limit(1);
  return r ?? null;
}
export async function listReports(userId: string): Promise<Report[]> {
  return db().select().from(metricReports).where(eq(metricReports.userId, userId)).orderBy(metricReports.period);
}
const keysOf = (r: Report | null): string[] => (Array.isArray(r?.shotKeys) ? (r!.shotKeys as unknown[]).filter((k): k is string => typeof k === "string") : []);

export const parseExtracted = (raw: unknown): Extracted | null => {
  const r = extractedSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseConfirmed = (raw: unknown): Confirmed | null => {
  const r = confirmedSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseExplanation = (raw: unknown): Explanation | null => {
  const r = explanationSchema.safeParse(raw);
  return r.success ? r.data : null;
};

/* ───────────── Capturas ───────────── */

export async function addShot(userId: string, period: string, raw: Buffer, declaredType: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!storageConfigured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const check = PHOTO_TYPES[declaredType as keyof typeof PHOTO_TYPES];
  if (!check || !check(raw)) return { ok: false, error: "La captura debe ser JPG, PNG o WebP." };
  if (raw.length > PHOTO_MAX_BYTES) return { ok: false, error: "La captura pesa demasiado (máximo 8 MB)." };
  let report = await getReport(userId, period);
  if (report && !["captura", "error"].includes(report.status)) return { ok: false, error: "Este mes ya se está leyendo o ya tiene informe. Rehazlo si quieres subir otras capturas." };
  if (keysOf(report).length >= MAX_SHOTS) return { ok: false, error: `Máximo ${MAX_SHOTS} capturas.` };

  let processed: { data: Buffer; contentType: string };
  try {
    processed = await normalizePhoto(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const key = `metricas/${userId}/${period}/${randomUUID()}.jpg`;
  await putObjectStream(key, Readable.from(processed.data), processed.contentType);
  if (!report) {
    await db().insert(metricReports).values({ userId, period, status: "captura", shots: 1, shotKeys: [key] }).onConflictDoNothing();
    report = await getReport(userId, period);
    if (report && !keysOf(report).includes(key)) {
      const keys = [...keysOf(report), key];
      await db().update(metricReports).set({ shots: keys.length, shotKeys: keys, status: "captura" }).where(eq(metricReports.id, report.id));
      return { ok: true, count: keys.length };
    }
    return { ok: true, count: 1 };
  }
  const keys = [...keysOf(report), key];
  await db().update(metricReports).set({ shots: keys.length, shotKeys: keys, status: "captura", error: null }).where(eq(metricReports.id, report.id));
  return { ok: true, count: keys.length };
}

export async function removeShot(userId: string, period: string, index: number): Promise<boolean> {
  const report = await getReport(userId, period);
  const keys = keysOf(report);
  if (!report || !["captura", "error"].includes(report.status) || index < 0 || index >= keys.length) return false;
  const [gone] = keys.splice(index, 1);
  await db().update(metricReports).set({ shots: keys.length, shotKeys: keys }).where(eq(metricReports.id, report.id));
  if (gone) await deleteObject(gone).catch(() => undefined);
  return true;
}

export async function readShotBytes(userId: string, period: string, index: number): Promise<{ body: ReadableStream; size: number } | null> {
  const keys = keysOf(await getReport(userId, period));
  const key = keys[index];
  if (!key) return null;
  const obj = await getObject(key);
  return obj ? { body: obj.body, size: obj.contentLength ?? 0 } : null;
}

/** Una lectura que lleva más de 20 minutos “procesando” se dio por perdida (el worker se detuvo): se puede reintentar. */
export const isStuck = (r: Report, now = Date.now()) => r.status === "procesando" && now - r.updatedAt.getTime() > 20 * 60 * 1000;

/** Manda las capturas a leer (trabajo en segundo plano). */
export async function submitReport(userId: string, period: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await getReport(userId, period);
  if (!report || keysOf(report).length === 0) return { ok: false, error: "Sube al menos una captura." };
  const stuck = report.status === "procesando" && isStuck(report);
  if (!["captura", "error"].includes(report.status) && !stuck) return { ok: false, error: "Este informe ya está en proceso." };
  await db().update(metricReports).set({ status: "procesando", error: null }).where(eq(metricReports.id, report.id));
  await enqueue("metricas.leer", userId, { period });
  return { ok: true };
}

/** Borra el informe del mes y sus capturas para empezar de nuevo. */
export async function resetReport(userId: string, period: string): Promise<void> {
  const report = await getReport(userId, period);
  if (!report) return;
  for (const k of keysOf(report)) await deleteObject(k).catch(() => undefined);
  await db().delete(metricReports).where(eq(metricReports.id, report.id));
}

/* ───────────── Lectura con IA (corre en el worker) ───────────── */

async function logCall(userId: string, skill: string, mock: boolean, status: "ok" | "error", tokens?: { i?: number; o?: number }) {
  await db()
    .insert(aiCalls)
    .values({ userId, skill, skillVersion: `${skill}-v1`, mock, status, costCents: 0, inputTokens: tokens?.i ?? null, outputTokens: tokens?.o ?? null })
    .catch(() => undefined);
}

const skillText = (dir: string) => readFile(path.join(process.cwd(), "skills", dir, "v2", "skill.md"), "utf8");

/** Lee las capturas del mes, guarda las cifras para que el creador las confirme y borra las imágenes. */
export async function runExtraction(userId: string, period: string): Promise<void> {
  const report = await getReport(userId, period);
  if (!report) return;
  const keys = keysOf(report);
  let extracted: Extracted;
  let mock = false;
  try {
    if (geminiConfigured() && keys.length > 0) {
      const parts = [] as Parameters<typeof geminiGenerate>[0];
      parts.push({ text: `${await skillText("metricas-capturas")}\n\nPeriodo esperado: ${period}. Devuelve solo el JSON.` });
      for (const k of keys) {
        const obj = await getObject(k);
        if (!obj) continue;
        parts.push({ inline: { mime: "image/jpeg", data: Buffer.from(await new Response(obj.body).arrayBuffer()) } });
      }
      const raw = await geminiGenerate(parts, { json: true, timeoutMs: 150_000 });
      extracted = extractedSchema.parse(parseJson(raw));
      await logCall(userId, "metricas-capturas", false, "ok");
    } else {
      extracted = sampleExtraction(userId, period);
      mock = true;
      await logCall(userId, "metricas-capturas", true, "ok");
    }
  } catch (err) {
    await logCall(userId, "metricas-capturas", false, "error");
    await db().update(metricReports).set({ status: "error", error: (err instanceof Error ? err.message : "No se pudieron leer las capturas").slice(0, 300) }).where(eq(metricReports.id, report.id));
    throw err;
  }
  // La privacidad primero: las capturas se borran en cuanto se leen.
  for (const k of keys) await deleteObject(k).catch(() => undefined);
  await db().update(metricReports).set({ status: "revision", extracted, mock, shotKeys: [], error: null }).where(eq(metricReports.id, report.id));
  void sendToUser(userId, { title: "Revisa tus cifras", body: "Leímos tus capturas. Confirma que los números estén bien y te explico cómo te fue.", url: "/progreso/metricas", tag: `metricas-${period}` }).catch(() => undefined);
}

/* ───────────── Confirmación y explicación ───────────── */

function fallbackExplanation(cur: Cuenta, changes: Change[], published: number): Explanation {
  const indicadores = buildIndicators(cur, changes);
  const best = [...changes].filter((c) => c.cambio_pct > 2).sort((a, b) => b.cambio_pct - a.cambio_pct)[0];
  const label = (id: string) => KEY_FIELDS.find((f) => f.id === id)?.label.toLowerCase() ?? id;
  const first = changes.length === 0;
  return {
    resumen: first ? "Este es tu primer informe: desde el siguiente mes podremos comparar cómo vas contra ti misma." : best ? `Lo mejor del mes: subieron tus ${label(best.campo)} (${best.cambio_pct > 0 ? "+" : ""}${best.cambio_pct} %).` : "Este mes tus números se mantuvieron parecidos al anterior.",
    indicadores: indicadores.length ? indicadores : [{ id: "vistas", etiqueta: "Vistas", valor: "—", cambio_pct: null, tono: "nuevo", explicacion: "" }],
    hallazgos: changes.slice(0, 3).map((c) => ({ texto: `${label(c.campo)[0]!.toUpperCase()}${label(c.campo).slice(1)}: ${c.cambio_pct > 0 ? "subieron" : c.cambio_pct < 0 ? "bajaron" : "se mantuvieron"} ${Math.abs(c.cambio_pct)} % contra el mes pasado.`, tipo: published < 10 ? ("hipotesis" as const) : ("dato" as const) })),
    para_la_parrilla: [],
    siguiente_paso: "Elige una publicación del mes que te haya gustado y repite su idea con un gancho distinto.",
    mensaje: "Cada mes que revisas tus números aprendes algo de tu público.",
  };
}

export async function confirmReport(userId: string, period: string, edits: Partial<Record<string, number | null>>): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await getReport(userId, period);
  const extracted = report ? parseExtracted(report.extracted) : null;
  if (!report || !extracted || report.status !== "revision") return { ok: false, error: "No hay cifras para confirmar." };

  const cuenta: Cuenta = { ...extracted.cuenta };
  const edited: string[] = [];
  for (const f of KEY_FIELDS) {
    if (!(f.id in edits)) continue;
    const v = edits[f.id];
    if (v === undefined) continue;
    if (v !== null && (v < 0 || (f.pct && v > 100) || v > 1_000_000_000)) return { ok: false, error: `Revisa el valor de “${f.label}”.` };
    if ((cuenta as Record<string, unknown>)[f.id] !== v) edited.push(f.id);
    (cuenta as Record<string, unknown>)[f.id] = v;
  }
  const confirmed: Confirmed = { periodo: period, cuenta, edited };

  const prevPeriod = previousPeriod(`${period}-01`);
  const prev = await getReport(userId, prevPeriod);
  const prevConfirmed = prev?.status === "lista" ? parseConfirmed(prev.confirmed) : null;
  const changes = compareMetrics(prevConfirmed?.cuenta, cuenta);
  const [{ n: published }] = await db().select({ n: count() }).from(contentPieces).where(and(eq(contentPieces.userId, userId), eq(contentPieces.status, "publicado")));

  let explanation = fallbackExplanation(cuenta, changes, published ?? 0);
  let mock = report.mock;
  if (claudeConfigured()) {
    try {
      const manual = await getManual(userId);
      const input = { creador_id: userId, periodo: period, actual: cuenta, anterior: prevConfirmed?.cuenta ?? null, cambios: changes, videos_publicados: published ?? 0, brujula: { nicho: manual?.content.nicho, pilares: manual?.content.pilares.map((p) => p.nombre), palabras_no: manual?.content.palabras_no }, perfil_voz: {} };
      const r = await claudeText(await skillText("metricas-explicacion"), `Entrada:\n${JSON.stringify(input)}\n\nResponde solo con el JSON de salida.`, { maxTokens: 2500 });
      const parsed = explanationSchema.parse(parseJson(r.text));
      // Los números son los calculados en código; de la IA solo se toma el texto de cada indicador.
      const base = buildIndicators(cuenta, changes);
      const ai = new Map(parsed.indicadores.map((i) => [i.id, i.explicacion]));
      explanation = { ...parsed, indicadores: base.map((i) => ({ ...i, explicacion: ai.get(i.id) ?? "", tono: toneOf(i.cambio_pct) })) };
      await logCall(userId, "metricas-explicacion", false, "ok", { i: r.inputTokens, o: r.outputTokens });
      mock = report.mock;
    } catch (err) {
      console.error("[metricas] la explicación con IA falló; se usa la básica:", err instanceof Error ? err.message : err);
      await logCall(userId, "metricas-explicacion", false, "error");
    }
  }
  await db().update(metricReports).set({ status: "lista", confirmed, explanation, mock }).where(eq(metricReports.id, report.id));
  return { ok: true };
}

