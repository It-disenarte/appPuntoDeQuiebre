import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getIntake, getManual } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { liveGuides, liveProfile } from "@/lib/db/schema";
import { getPlanDays } from "./week";
import { getPlan } from "@/lib/plan/service";
import { runDirectos } from "@/lib/skills";
import { mockGuide, mockRecommendation } from "./mock";
import { answersSchema, guideOutput, MAX_NOT_NOW, recommendationOutput, shapeWeek, supportOutput, type Answers, type GuideOut, type Live, type Recommendation } from "./schemas";

export type ProfileRow = typeof liveProfile.$inferSelect;
export type GuideRow = typeof liveGuides.$inferSelect;
type Result = { ok: true } | { ok: false; error: string };

export async function getLiveProfile(userId: string): Promise<ProfileRow | null> {
  const [r] = await db().select().from(liveProfile).where(eq(liveProfile.userId, userId)).limit(1);
  return r ?? null;
}
export const parseAnswers = (r: ProfileRow | null): Answers | null => {
  if (!r?.situacion) return null;
  const a = answersSchema.safeParse({ situacion: r.situacion, plataformas: r.plataformas, dias: r.dias, hora: r.hora, frecuencia: r.frecuencia, compromiso: r.compromiso });
  return a.success ? a.data : null;
};
export const parseRecommendation = (raw: unknown): Recommendation | null => {
  const r = recommendationOutput.shape.recomendacion.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseGuide = (raw: unknown): GuideOut | null => {
  const r = guideOutput.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseDone = (raw: unknown): Record<string, boolean> => (raw && typeof raw === "object" ? (raw as Record<string, boolean>) : {});

export async function getWeekGuide(userId: string, weekStart: string): Promise<GuideRow | null> {
  const [g] = await db().select().from(liveGuides).where(and(eq(liveGuides.userId, userId), eq(liveGuides.kind, "semanal"), eq(liveGuides.weekStart, weekStart))).limit(1);
  return g ?? null;
}
export const listSupport = (userId: string) => db().select().from(liveGuides).where(and(eq(liveGuides.userId, userId), eq(liveGuides.kind, "apoyo"))).orderBy(desc(liveGuides.createdAt)).limit(5);

async function context(userId: string, weekStart: string | null) {
  const [manual, intake, profile, past] = await Promise.all([
    getManual(userId).catch(() => null),
    getIntake(userId).catch(() => null),
    getLiveProfile(userId),
    db().select({ result: liveGuides.result }).from(liveGuides).where(eq(liveGuides.userId, userId)).orderBy(desc(liveGuides.createdAt)).limit(8),
  ]);
  const plan = weekStart ? await getPlan(userId, weekStart).catch(() => null) : null;
  const a = parseAnswers(profile);
  const used = past.flatMap((p) => parseGuide(p.result)?.lives.map((l) => l.titulo) ?? []);
  return {
    pilares: manual?.content.pilares.map((p) => p.nombre) ?? [],
    redes: intake?.quick?.redes ?? [],
    raw: {
      brujula: { pilares: manual?.content.pilares ?? [], tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [], postura: manual?.content.postura ?? "", lives: { plataforma: manual?.content.lives?.plataforma ?? "", frecuencia: a?.frecuencia ?? manual?.content.lives?.frecuencia ?? null, situacion: a?.situacion ?? null, plataformas: a?.plataformas ?? [], dias: a?.dias ?? [], hora: a?.hora ?? null, compromiso: a?.compromiso ?? null } },
      redes_que_usa: intake?.quick?.redes ?? [],
      parrilla_de_la_semana: (plan?.pieces ?? []).map((p) => ({ dia: p.day, tema: p.topic, pilar: p.pillar })),
      temas_ya_usados: used,
      avisos_ahora_no_seguidos: profile?.avisosNoSeguidos ?? 0,
      lives_anteriores: [],
    },
  };
}

/** Guarda las respuestas; si quiere empezar o no quiere, también guarda la recomendación de la skill. */
export async function saveAnswers(userId: string, raw: unknown): Promise<Result> {
  const a = answersSchema.safeParse(raw);
  if (!a.success) return { ok: false, error: "Revisa tus respuestas." };
  const d = a.data;
  if (d.situacion === "hace" && (d.dias.length === 0 || d.plataformas.length === 0)) return { ok: false, error: "Cuéntanos en qué app y qué días haces tus directos." };
  if (d.situacion === "quiere_hacer" && !d.compromiso) return { ok: false, error: "Cuéntanos cuándo harías un directo sí o sí." };
  const values = { situacion: d.situacion, plataformas: d.plataformas, dias: d.dias, hora: d.hora, frecuencia: d.frecuencia, compromiso: d.compromiso };
  await db().insert(liveProfile).values({ userId, ...values }).onConflictDoUpdate({ target: liveProfile.userId, set: values });
  if (d.situacion !== "hace") {
    const ctx = await context(userId, null);
    const r = await runDirectos(userId, { creador_id: userId, ...ctx.raw, modo_pedido: "recomendacion", solicitud: { tipo: "apoyo", tema_del_creador: null }, mes: new Date().toISOString().slice(0, 7) }, recommendationOutput, () => ({ skill_version: "guia-lives-v2", recomendacion: mockRecommendation(ctx.redes, null) }));
    await db().update(liveProfile).set({ recomendacion: r.output.recomendacion }).where(eq(liveProfile.userId, userId));
  }
  return { ok: true };
}

export async function resetSituation(userId: string): Promise<void> {
  await db().update(liveProfile).set({ situacion: null, recomendacion: null }).where(eq(liveProfile.userId, userId));
}

/** Guía de directos de una semana. Se rehace entera cada vez (reemplaza la anterior de esa semana). */
export async function generateWeek(userId: string, weekStart: string): Promise<Result> {
  const profile = await getLiveProfile(userId);
  const a = parseAnswers(profile);
  if (!a || a.situacion === "no_quiere") return { ok: false, error: "Primero cuéntanos si haces o quieres hacer directos." };
  const beginner = a.situacion === "quiere_hacer";
  const weekDays = getPlanDays(weekStart);
  const selected: string[] = beginner ? [a.dias[0] ?? "miércoles"] : a.dias;
  const platform = a.plataformas[0] ?? "tiktok";
  const ctx = await context(userId, weekStart);
  const wanted = weekDays.filter((d) => selected.includes(d.name)).map((d) => d.iso);
  const r = await runDirectos(
    userId,
    { creador_id: userId, ...ctx.raw, modo_pedido: "guia", solicitud: { tipo: "semanal", tema_del_creador: null }, mes: weekStart.slice(0, 7), dias_de_la_semana: wanted, recordatorio: beginner ? "Quiere empezar: 1 directo por semana de 30 minutos, todos con guion." : "Máximo 3 directos ancla; los demás días son libres." },
    guideOutput,
    () => mockGuide(wanted.slice(0, beginner ? 1 : 3), ctx.pilares, platform),
  );
  const shaped = shapeWeek(r.output, { weekDays, selectedDays: selected, platform, beginner });
  await db().delete(liveGuides).where(and(eq(liveGuides.userId, userId), eq(liveGuides.kind, "semanal"), eq(liveGuides.weekStart, weekStart)));
  await db().insert(liveGuides).values({ userId, kind: "semanal", weekStart, result: shaped, mock: r.mock });
  return { ok: true };
}

/** “Pedir apoyo para un directo”: 1 tema con apertura, 3 puntos, preguntas y cierre. */
export async function requestSupport(userId: string, tema: string): Promise<Result> {
  const ctx = await context(userId, null);
  const profile = parseAnswers(await getLiveProfile(userId));
  const platform = profile?.plataformas[0] ?? "tiktok";
  const r = await runDirectos(
    userId,
    { creador_id: userId, ...ctx.raw, modo_pedido: "apoyo", solicitud: { tipo: "apoyo", tema_del_creador: tema.trim().slice(0, 140) || null }, mes: new Date().toISOString().slice(0, 7) },
    supportOutput,
    () => ({ skill_version: "guia-lives-v2", lives: mockGuide([new Date().toISOString().slice(0, 10)], ctx.pilares, platform).lives.slice(0, 1).map((l): Live => ({ ...l, puntos_para_hablar: l.puntos_para_hablar.slice(0, 3), titulo: tema.trim() || l.titulo })) }),
  );
  await db().insert(liveGuides).values({ userId, kind: "apoyo", result: { skill_version: "guia-lives-v2", mes: null, lives_sugeridos: 1, lives: r.output.lives, comodines: r.output.comodines }, mock: r.mock });
  return { ok: true };
}

export async function markDone(userId: string, guideId: string, dia: string): Promise<void> {
  const [g] = await db().select().from(liveGuides).where(and(eq(liveGuides.id, guideId), eq(liveGuides.userId, userId))).limit(1);
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
  const done = parseDone(g.done);
  await db().update(liveGuides).set({ done: { ...done, [dia]: !done[dia] } }).where(eq(liveGuides.id, guideId));
}

/** Aviso mensual (solo para quien no quiere hacer directos): “Ahora no” suma; con 3 seguidos deja de salir. */
export const showMonthlyNotice = (p: ProfileRow | null) => p?.situacion === "no_quiere" && p.avisosNoSeguidos < MAX_NOT_NOW;
export async function dismissNotice(userId: string): Promise<void> {
  const p = await getLiveProfile(userId);
  if (p) await db().update(liveProfile).set({ avisosNoSeguidos: p.avisosNoSeguidos + 1 }).where(eq(liveProfile.userId, userId));
}
export async function resetNotice(userId: string): Promise<void> {
  await db().update(liveProfile).set({ avisosNoSeguidos: 0 }).where(eq(liveProfile.userId, userId));
}


