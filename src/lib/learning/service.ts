import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { getVoiceProfile } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { contentPieces, learningRuns, voiceProfiles, weekPlans } from "@/lib/db/schema";
import { listReports, parseConfirmed } from "@/lib/metrics/service";
import { adjustMix, type Mix } from "@/lib/plan/rules";
import { parseReview, parseScript } from "@/lib/plan/service";
import { runAprendizaje } from "@/lib/skills";
import { aprendizajeV1Output, textosV2Output, type AprendizajeV1, type VideoGuion } from "@/lib/skills/schemas";

/** Pantalla a la que pertenece el paso de aprendizaje en segundo plano. */
export const LEARNING_SCOPE = "aprendizaje";

/** Mínimo de piezas con señales para que la IA saque conclusiones (regla 1 de la skill). */
export const MIN_SIGNALS = 6;
const LOOKBACK_DAYS = 90;
const MAX_PREFERENCES = 12;
const clip = (s: string, n = 400) => (s.length > n ? s.slice(0, n) : s);

type Hook = "pregunta" | "confesion" | "dato" | "creencia_contraria" | "escena" | "otro";

/** Tipo de gancho, a ojo: la app no lo guarda, así que se deduce del texto del gancho. */
export function hookKind(gancho: string): Hook {
  const g = gancho.trim().toLowerCase();
  if (!g) return "otro";
  if (g.startsWith("¿") || g.endsWith("?")) return "pregunta";
  if (/^(ayer|hoy|anoche|la semana pasada|el otro día|hace (un|una|unos|unas|\d+))\b/.test(g)) return "escena";
  if (/\d/.test(g)) return "dato";
  if (/^(todos|todas|dicen|nadie|siempre|nunca|no necesitas|no es)\b/.test(g) || /\b(al contrario|lo contrario|mito)\b/.test(g)) return "creencia_contraria";
  if (/^(yo |mi |me |cometí|confieso|admito|durante)/.test(g)) return "confesion";
  return "otro";
}

type PieceRow = typeof contentPieces.$inferSelect;

/** Una pieza cuenta como "con señales" si el creador reaccionó a ella (votó, la descartó) o ya la publicó o programó. */
function toSignal(p: PieceRow) {
  const review = parseReview(p.textsReview);
  const votes = Object.values(review?.votos ?? {});
  const calificacion: "me_gusto" | "no_me_gusto" | null = votes.length === 0 ? null : votes.includes("no") ? "no_me_gusto" : "me_gusto";
  const script = parseScript(p.kind, p.script);
  const gancho = p.kind === "video" ? ((script as VideoGuion | null)?.gancho ?? "") : "";
  const descartada = p.status === "descartado";
  const publicada = p.status === "publicado" || p.status === "programado";
  const hasSignal = calificacion !== null || descartada || publicada;
  return {
    hasSignal,
    piece: {
      id: p.id,
      formato: p.kind,
      categoria: p.category,
      tipo: p.type,
      pilar: p.pillar,
      tema: p.topic,
      tipo_gancho: hookKind(gancho),
      duracion_segundos: p.kind === "video" ? ((script as VideoGuion | null)?.duracion_segundos ?? null) : null,
      calificacion,
      motivos: [] as string[],
      edito_guion: votes.includes("editado"),
      descartada,
      publicada,
      metricas: null,
    },
  };
}

/** Los cambios que el creador hizo a los textos que escribió la app: la señal más clara de su voz. */
function textEdits(rows: PieceRow[]) {
  const out: { antes: string; despues: string; pieza_id: string }[] = [];
  for (const p of rows) {
    const review = parseReview(p.textsReview);
    const texts = textosV2Output.safeParse(p.texts);
    if (!review || !texts.success) continue;
    for (const [net, after] of Object.entries(review.edits)) {
      const before = (texts.data as Record<string, { texto?: string } | undefined>)[net]?.texto;
      if (typeof before === "string" && before.trim() && after.trim() && before.trim() !== after.trim()) out.push({ antes: clip(before), despues: clip(after), pieza_id: p.id });
    }
  }
  return out.slice(0, 20);
}

export async function gatherSignals(userId: string) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const rows = await db().select().from(contentPieces).where(and(eq(contentPieces.userId, userId), gte(contentPieces.createdAt, since))).orderBy(desc(contentPieces.createdAt)).limit(80);
  const signals = rows.map(toSignal);
  return { pieces: signals.filter((s) => s.hasSignal).map((s) => s.piece), edits: textEdits(rows) };
}

const toFractions = (m: Mix) => ({ viral: m.viral / 100, nicho: m.nicho / 100, conversion: m.conversion / 100 });

async function latestMix(userId: string): Promise<Mix> {
  const [row] = await db().select({ mix: weekPlans.mix }).from(weekPlans).where(eq(weekPlans.userId, userId)).orderBy(desc(weekPlans.createdAt)).limit(1);
  const m = row?.mix as Partial<Mix> | undefined;
  return m && typeof m.viral === "number" && typeof m.nicho === "number" && typeof m.conversion === "number" ? { viral: m.viral, nicho: m.nicho, conversion: m.conversion } : { viral: 40, nicho: 40, conversion: 20 };
}

type Result = { ok: true } | { ok: false; error: string };

/** Mezcla las preferencias nuevas con las que ya había (la misma `cambia` se reemplaza), marcadas como aprendidas. */
function mergePreferences(current: unknown[], fresh: AprendizajeV1["preferencias_nuevas"]): unknown[] {
  const key = (x: unknown) => String((x as { cambia?: string }).cambia ?? "").trim().toLowerCase();
  const marked = fresh.map((p) => ({ cambia: p.cambia, por: p.por, motivo: p.motivo, origen: "aprendizaje" }));
  const freshKeys = new Set(marked.map(key));
  return [...marked, ...current.filter((x) => !freshKeys.has(key(x)))].slice(0, MAX_PREFERENCES);
}

/** Corre el aprendizaje del creador. Con pocas señales no llama a la IA: lo deja dicho con amabilidad. */
export async function runLearning(userId: string): Promise<Result> {
  const voice = await getVoiceProfile(userId);
  if (!voice) return { ok: false, error: "Primero termina tu perfil de voz." };
  const { pieces, edits } = await gatherSignals(userId);

  if (pieces.length < MIN_SIGNALS) {
    const result: AprendizajeV1 = aprendizajeV1Output.parse({
      suficiente_evidencia: false,
      para_el_creador: `Todavía me falta conocerte un poco más: llevo ${pieces.length} de ${MIN_SIGNALS} piezas con las que puedo aprender. Cuando califiques tus textos o publiques más piezas, te cuento lo que vea.`,
    });
    await db().insert(learningRuns).values({ userId, signals: pieces.length, result, mock: false, skillVersion: "reglas-aprendizaje-v1" });
    return { ok: true };
  }

  const [reports, base] = await Promise.all([listReports(userId), latestMix(userId)]);
  const confirmed = reports.filter((r) => r.status === "lista").map((r) => parseConfirmed(r.confirmed)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const v = voice.content;
  const input = {
    creador_id: userId,
    periodo: new Date().toISOString().slice(0, 7),
    piezas: pieces,
    ediciones_de_texto: edits,
    perfil_voz_actual: { frases_firma: v.frases_firma, evitar: v.evitar, reglas_para_guiones: v.reglas_para_guiones, preferencias_aprendidas: v.preferencias_aprendidas },
    mezcla_actual: toFractions(base),
    cifras_mes: { actual: confirmed.at(-1)?.cuenta ?? null, anterior: confirmed.at(-2)?.cuenta ?? null },
  };
  const res = await runAprendizaje(userId, input);
  await db().insert(learningRuns).values({ userId, signals: pieces.length, result: res.output, mock: res.mock, skillVersion: res.skillVersion });

  if (res.output.suficiente_evidencia && res.output.preferencias_nuevas.length > 0 && !res.mock) {
    const merged = mergePreferences(v.preferencias_aprendidas ?? [], res.output.preferencias_nuevas);
    await db().update(voiceProfiles).set({ content: { ...v, preferencias_aprendidas: merged } }).where(eq(voiceProfiles.userId, userId));
  }
  return { ok: true };
}

export type Learning = { id: string; createdAt: Date; signals: number; mock: boolean; result: AprendizajeV1 };

export async function latestLearning(userId: string): Promise<Learning | null> {
  const [row] = await db().select().from(learningRuns).where(eq(learningRuns.userId, userId)).orderBy(desc(learningRuns.createdAt)).limit(1);
  if (!row) return null;
  const result = aprendizajeV1Output.safeParse(row.result);
  return result.success ? { id: row.id, createdAt: row.createdAt, signals: row.signals, mock: row.mock, result: result.data } : null;
}

/** Lo vigente que sirve para las próximas semanas: la última corrida con evidencia suficiente y real. */
async function activeLearning(userId: string): Promise<AprendizajeV1 | null> {
  const rows = await db().select().from(learningRuns).where(eq(learningRuns.userId, userId)).orderBy(desc(learningRuns.createdAt)).limit(5);
  for (const r of rows) {
    const p = aprendizajeV1Output.safeParse(r.result);
    if (p.success && p.data.suficiente_evidencia && !r.mock) return p.data;
  }
  return null;
}

/** Reglas para la guionista que salieron del aprendizaje (se suman a las de su perfil de voz). */
export async function learnedRules(userId: string): Promise<string[]> {
  return ((await activeLearning(userId))?.reglas_para_guiones ?? []).slice(0, 5);
}

/** La mezcla de la semana con el ajuste aprendido: como máximo ±10 puntos y la conversión nunca pasa de 35 % (se vuelve a limitar aquí). */
export async function learnedMix(userId: string, base: Mix): Promise<Mix> {
  const a = (await activeLearning(userId))?.ajuste_mezcla;
  if (!a) return base;
  const pts = (d: number) => Math.round(d * 100);
  return adjustMix(base, { viral: base.viral + pts(a.viral), nicho: base.nicho + pts(a.nicho), conversion: base.conversion + pts(a.conversion) });
}

/** Olvidar lo aprendido: borra las corridas y quita las preferencias que vinieron del aprendizaje. */
export async function forgetLearning(userId: string): Promise<void> {
  await db().delete(learningRuns).where(eq(learningRuns.userId, userId));
  const voice = await getVoiceProfile(userId);
  if (!voice) return;
  const kept = (voice.content.preferencias_aprendidas ?? []).filter((x) => (x as { origen?: string }).origen !== "aprendizaje");
  await db().update(voiceProfiles).set({ content: { ...voice.content, preferencias_aprendidas: kept } }).where(eq(voiceProfiles.userId, userId));
}
