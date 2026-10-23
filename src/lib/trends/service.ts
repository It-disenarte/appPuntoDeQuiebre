import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { getLimits } from "@/lib/admin/limits";
import { getSubscription } from "@/lib/billing/service";
import { getIntake, getManual, getSchedule } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { trendsUsed, trendUses } from "@/lib/db/schema";
import { addDays, mondayOf, todayIso } from "@/lib/plan/rules";
import { runTendencias } from "@/lib/skills";
import { env } from "@/lib/env";
import { deferTrendsRetry, latestList, refreshTrends } from "./list";
import { IDEAS_PER_USE, MAX_REFRESH, shapeIdeas, trendsOutput, usable, type Trend, type TrendIdea, type TrendsOut } from "./schemas";

export type Use = typeof trendUses.$inferSelect;
type Round = { ideas: TrendIdea[]; note: string | null; aviso: string | null };
type Result = { ok: true } | { ok: false; error: string };

export const parseRounds = (raw: unknown): Round[] => (Array.isArray(raw) ? (raw as Round[]).filter((r) => r && Array.isArray(r.ideas)) : []);

/** La lista del día. Si todavía no hay ninguna, se guarda la de ejemplo (o la del actor) en el momento. */
export async function currentList(): Promise<{ day: string; items: Trend[]; source: "apify" | "muestra" }> {
  const cur = await latestList();
  // Si hoy solo hay la lista de ejemplo y ya se configuró el actor de Apify, se intenta con tendencias reales (cada 30 min a lo más,
  // para no esperar al aviso diario de las 6:00 ni repetir un actor que falla en cada visita).
  const e = env();
  const wantsReal = cur?.source === "muestra" && Boolean(e.APIFY_TOKEN && e.APIFY_TRENDS_ACTOR) && Date.now() - cur.createdAt.getTime() > 30 * 60 * 1000;
  if (cur && cur.items.length && !wantsReal) return cur;
  if (wantsReal) await deferTrendsRetry(cur!.day);
  await refreshTrends().catch(() => undefined);
  return (await latestList()) ?? { day: todayIso(), items: [], source: "muestra" };
}

export async function usedIds(userId: string): Promise<Set<string>> {
  const rows = await db().select({ id: trendsUsed.trendId }).from(trendsUsed).where(eq(trendsUsed.userId, userId));
  return new Set(rows.map((r) => r.id));
}

export async function weeklyQuota(userId: string, today = todayIso()): Promise<{ used: number; limit: number; renews: string }> {
  const [sub, limits] = await Promise.all([getSubscription(userId), getLimits()]);
  const week = mondayOf(today);
  const [{ n }] = await db().select({ n: count() }).from(trendUses).where(and(eq(trendUses.userId, userId), eq(trendUses.weekStart, week)));
  return { used: n ?? 0, limit: sub?.plan === "pro" ? limits.trendsWeeklyPro : limits.trendsWeeklyBasico, renews: addDays(week, 7) };
}

export const listUses = (userId: string) => db().select().from(trendUses).where(eq(trendUses.userId, userId)).orderBy(desc(trendUses.createdAt)).limit(5);

async function context(userId: string) {
  const [manual, intake, schedule, sub] = await Promise.all([getManual(userId).catch(() => null), getIntake(userId).catch(() => null), getSchedule(userId).catch(() => null), getSubscription(userId)]);
  const blocks = schedule?.result.bloques ?? [];
  const pick = (tipo: "fijo" | "respaldo") => blocks.filter((b) => b.tipo === tipo && b.dia).map((b) => ({ dia: b.dia, hora: b.inicio }));
  return {
    pilares: manual?.content.pilares.map((p) => p.nombre) ?? [],
    redes: intake?.quick?.redes ?? [],
    raw: {
      plan: sub?.plan ?? "basico",
      brujula: { pilares: manual?.content.pilares ?? [], tono: manual?.content.tono ?? null, palabras_si: manual?.content.palabras_si ?? [], postura: manual?.content.postura ?? "" },
      redes_que_usa: intake?.quick?.redes ?? [],
      horario: { dias_grabacion: pick("fijo"), respaldo: pick("respaldo") },
    },
  };
}

function mockIdeas(list: Trend[], pilares: string[], redes: string[], today: string): TrendsOut {
  const formats = ["reel", "reel", "carrusel"] as const;
  return {
    skill_version: "tendencias-v2",
    fecha: today,
    ideas: list.slice(0, IDEAS_PER_USE).map((t, i) => ({
      tendencia_id: t.id,
      tendencia_nombre: t.nombre,
      formato: formats[i % 3]!,
      redes: redes.length ? redes : ["tiktok"],
      pilar: pilares[i % Math.max(1, pilares.length)] ?? "",
      urgencia: { estado: t.estado === "pico" ? "pico" : "subiendo", texto: t.estado === "pico" ? "Está en su pico: grábala hoy o mañana" : "Va subiendo: tienes unos días", grabar_antes_de: today },
      cuando_grabar: "En tu próximo día de grabación (o grábala hoy en 15 minutos).",
      por_que_te_sirve: "Encaja con tus pilares y te da una forma conocida para contar tu tema. (Idea de ejemplo.)",
      idea: `Cuenta uno de tus temas con la forma de «${t.nombre}».`,
      gancho: "Esto te lo debía desde hace tiempo…",
      guion: ["Gancho con la forma de la tendencia", "Tu tema en 2 pasos", "Cierre con invitación"],
      como_grabarla: "Vertical, luz de frente y corte rápido al ritmo del audio.",
      audio: { nombre: t.audio.nombre, nota: t.audio.nombre ? "Busca el mismo audio en Instagram; si no está, usa uno parecido." : null, link: t.audio.link },
      video_ejemplo: t.link_ejemplo,
      siguiente_paso: formats[i % 3] === "carrusel" ? "skill_8" : "grabar",
    })),
    descartadas: [],
    aviso: null,
  };
}

async function runIdeas(userId: string, list: Trend[], used: Set<string>, shown: Set<string>, extra: Record<string, unknown>) {
  const ctx = await context(userId);
  const today = todayIso();
  const candidates = usable(list, used).filter((t) => !shown.has(t.id));
  const input = { creador_id: userId, ...ctx.raw, modo: "aprendizaje", fecha_hoy: today, tendencias: list, tendencias_ya_usadas: [...used], ...extra };
  const r = await runTendencias(userId, input, trendsOutput, () => mockIdeas(candidates, ctx.pilares, ctx.redes, today));
  return { out: shapeIdeas(r.output, list, used, shown, today), mock: r.mock };
}

/** Un uso nuevo de “Ver tendencias”: cuenta contra el límite semanal del plan. */
export async function requestUse(userId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const q = await weeklyQuota(userId);
  if (q.used >= q.limit) return { ok: false, error: `Ya usaste tus ${q.limit} consultas de esta semana. Se renuevan el ${q.renews.slice(8, 10)}/${q.renews.slice(5, 7)}.` };
  const [list, used] = await Promise.all([currentList(), usedIds(userId)]);
  if (usable(list.items, used).length === 0) return { ok: false, error: "Hoy no hay tendencias nuevas que puedas aprovechar. Vuelve mañana." };
  const { out, mock } = await runIdeas(userId, list.items, used, new Set(), { solicitud: { tipo: "ideas", numero_refresh: 0, nota: null, ideas_anteriores: [], tendencia_id: null } });
  const [row] = await db().insert(trendUses).values({ userId, weekStart: mondayOf(todayIso()), rounds: [{ ideas: out.ideas, note: null, aviso: out.aviso }], mock: mock || list.source === "muestra" }).returning({ id: trendUses.id });
  return { ok: true, id: row!.id };
}

async function getUse(userId: string, id: string): Promise<Use | null> {
  const [u] = await db().select().from(trendUses).where(and(eq(trendUses.id, id), eq(trendUses.userId, userId))).limit(1);
  return u ?? null;
}

/** “Ninguna me convence” + nota: máx. 2, no borra las anteriores y no cuenta como un uso nuevo. */
export async function refreshUse(userId: string, id: string, nota: string): Promise<Result> {
  const use = await getUse(userId, id);
  if (!use) return { ok: false, error: "No encontramos esa consulta." };
  if (use.refreshes >= MAX_REFRESH) return { ok: false, error: "Ya pediste otras ideas dos veces. Elige una tendencia de la lista." };
  if (nota.trim().length < 3) return { ok: false, error: "Cuéntanos qué no te convenció." };
  const rounds = parseRounds(use.rounds);
  const shown = new Set(rounds.flatMap((r) => r.ideas.map((i) => i.tendencia_id)));
  const [list, used] = await Promise.all([currentList(), usedIds(userId)]);
  const { out } = await runIdeas(userId, list.items, used, shown, { solicitud: { tipo: "refresh", numero_refresh: use.refreshes + 1, nota: nota.slice(0, 300), ideas_anteriores: [...shown], tendencia_id: null } });
  if (!out.ideas.length) return { ok: false, error: "No hay más tendencias que encajen. Elige una de la lista." };
  await db().update(trendUses).set({ rounds: [...rounds, { ideas: out.ideas, note: nota.slice(0, 300), aviso: out.aviso }], refreshes: use.refreshes + 1 }).where(eq(trendUses.id, id));
  return { ok: true };
}

/** Selector manual (después de los 2 refresh): arma solo la idea de la tendencia elegida. */
export async function chooseTrend(userId: string, id: string, trendId: string): Promise<Result> {
  const use = await getUse(userId, id);
  if (!use) return { ok: false, error: "No encontramos esa consulta." };
  const [list, used] = await Promise.all([currentList(), usedIds(userId)]);
  const t = usable(list.items, used).find((x) => x.id === trendId);
  if (!t) return { ok: false, error: "Esa tendencia ya no está disponible." };
  const ctx = await context(userId);
  const today = todayIso();
  const input = { creador_id: userId, ...ctx.raw, modo: "aprendizaje", fecha_hoy: today, tendencias: [t], tendencias_ya_usadas: [...used], solicitud: { tipo: "elegida", numero_refresh: use.refreshes, nota: null, ideas_anteriores: [], tendencia_id: t.id } };
  const r = await runTendencias(userId, input, trendsOutput, () => mockIdeas([t], ctx.pilares, ctx.redes, today));
  const out = shapeIdeas(r.output, [t], used, new Set(), today);
  if (!out.ideas.length) return { ok: false, error: out.descartadas[0]?.motivo ?? "Esa tendencia no encaja con tu marca." };
  await db().update(trendUses).set({ rounds: [...parseRounds(use.rounds), { ideas: out.ideas, note: `Elegida: ${t.nombre}`, aviso: null }] }).where(eq(trendUses.id, id));
  return { ok: true };
}

/** El creador decidió usar esta tendencia: no se le vuelve a ofrecer. */
export async function markTrendUsed(userId: string, trendId: string): Promise<void> {
  if (!/^[\w-]{1,40}$/.test(trendId)) return;
  await db().insert(trendsUsed).values({ userId, trendId }).onConflictDoNothing();
}

export async function selectableTrends(userId: string): Promise<Trend[]> {
  const [list, used] = await Promise.all([currentList(), usedIds(userId)]);
  return usable(list.items, used);
}


