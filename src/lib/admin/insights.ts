import "server-only";
import { and, eq, gte, inArray, min, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiCalls, analyzerRuns, brandManuals, contentPieces, creatorIntake, kitVisual, metricReports, payments, recordings, schedules, sessions, subscriptions, users, weekPlans } from "@/lib/db/schema";
import { getPrices, type Prices } from "./limits";
import { alertsOf, buildFacts, type CreatorFacts } from "./insights-core";

export * from "./insights-core";

const DAY = 86_400_000;

/** Carga en bloque lo que se necesita saber de cada creador (o de uno solo). Pocas consultas agregadas, no una por cliente. */
export async function loadFacts(only?: string): Promise<CreatorFacts[]> {
  const d = db();
  const since = new Date(Date.now() - 60 * DAY);
  const uw = only ? eq(users.id, only) : undefined;
  const byUser = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.userId) ?? m.set(r.userId, []).get(r.userId)!).push(r);
    return m;
  };
  const [us, subs, intake, manual, kit, sched, plan, rec, metr, recent, pieces, sess] = await Promise.all([
    d.select({ id: users.id, name: users.name, email: users.email, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(and(eq(users.role, "creator"), uw)),
    d.select({ userId: subscriptions.userId, plan: subscriptions.plan, status: subscriptions.status, trialEnd: subscriptions.trialEnd, createdAt: subscriptions.createdAt, pastDueSince: subscriptions.pastDueSince }).from(subscriptions),
    d.select({ userId: creatorIntake.userId, at: creatorIntake.completedAt }).from(creatorIntake),
    d.select({ userId: brandManuals.userId, at: brandManuals.approvedAt }).from(brandManuals),
    d.select({ userId: kitVisual.userId, at: kitVisual.approvedAt }).from(kitVisual),
    d.select({ userId: schedules.userId, at: schedules.acceptedAt }).from(schedules),
    d.select({ userId: weekPlans.userId, at: min(weekPlans.createdAt) }).from(weekPlans).groupBy(weekPlans.userId),
    d.select({ userId: recordings.userId, at: min(recordings.createdAt) }).from(recordings).groupBy(recordings.userId),
    d.select({ userId: metricReports.userId, at: min(metricReports.updatedAt) }).from(metricReports).where(eq(metricReports.status, "lista")).groupBy(metricReports.userId),
    d.select({ userId: recordings.userId, at: recordings.createdAt }).from(recordings).where(gte(recordings.createdAt, since)),
    d.select({ userId: contentPieces.userId, at: contentPieces.updatedAt }).from(contentPieces).where(and(gte(contentPieces.updatedAt, since), inArray(contentPieces.status, ["grabado", "programado", "publicado"]))),
    d.select({ userId: sessions.userId, at: max(sessions.lastSeenAt) }).from(sessions).groupBy(sessions.userId),
  ]);
  const one = <T extends { userId: string; at: Date | null }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r.at]));
  const subBy = new Map(subs.map((s) => [s.userId, s]));
  const m = { intake: one(intake), manual: one(manual), kit: one(kit), schedule: one(sched), plan: one(plan), recording: one(rec), metrics: one(metr) };
  const works = byUser([...recent.map((r) => ({ userId: r.userId, at: r.at })), ...pieces.map((r) => ({ userId: r.userId, at: r.at }))]);
  const seen = one(sess);
  return us.map((u) =>
    buildFacts({
      user: u,
      sub: subBy.get(u.id) ?? null,
      milestones: { intake: m.intake.get(u.id) ?? null, manual: m.manual.get(u.id) ?? null, kit: m.kit.get(u.id) ?? null, schedule: m.schedule.get(u.id) ?? null, plan: m.plan.get(u.id) ?? null, recording: m.recording.get(u.id) ?? null, metrics: m.metrics.get(u.id) ?? null },
      workDates: (works.get(u.id) ?? []).map((r) => r.at),
      lastSeen: seen.get(u.id) ?? null,
    }),
  );
}

export async function currentAlerts(now = new Date()) {
  return alertsOf(await loadFacts(), now);
}

/* ───────────── Costo de IA contra ingreso ───────────── */

const GEMINI_SKILLS = new Set(["metricas-capturas", "calificador-foto", "analizador-video"]);

export type Usage = { calls: number; costUsd: number };

/** Costo ESTIMADO (no la factura real): tokens de Claude por su precio, llamadas de Gemini a precio fijo y corridas de Apify. */
export async function usageSince(since: Date, userId?: string, prices?: Prices): Promise<Map<string, Usage>> {
  const p = prices ?? (await getPrices());
  const d = db();
  const rows = await d
    .select({ userId: aiCalls.userId, skill: aiCalls.skill, n: sql<number>`count(*)::int`, inTok: sql<number>`coalesce(sum(${aiCalls.inputTokens}),0)::int`, outTok: sql<number>`coalesce(sum(${aiCalls.outputTokens}),0)::int` })
    .from(aiCalls)
    .where(and(gte(aiCalls.createdAt, since), eq(aiCalls.mock, false), eq(aiCalls.status, "ok"), userId ? eq(aiCalls.userId, userId) : undefined))
    .groupBy(aiCalls.userId, aiCalls.skill);
  const out = new Map<string, Usage>();
  const add = (id: string | null, calls: number, usd: number) => {
    if (!id) return;
    const cur = out.get(id) ?? { calls: 0, costUsd: 0 };
    out.set(id, { calls: cur.calls + calls, costUsd: cur.costUsd + usd });
  };
  for (const r of rows) add(r.userId, r.n, GEMINI_SKILLS.has(r.skill) ? r.n * p.geminiCallUsd : (r.inTok / 1e6) * p.claudeInUsdPerM + (r.outTok / 1e6) * p.claudeOutUsdPerM);
  const runs = await d.select({ userId: analyzerRuns.userId, summary: analyzerRuns.summary }).from(analyzerRuns).where(and(gte(analyzerRuns.createdAt, since), eq(analyzerRuns.mock, false), eq(analyzerRuns.status, "lista"), userId ? eq(analyzerRuns.userId, userId) : undefined));
  for (const r of runs) add(r.userId, 0, p.apifyRunUsd * Math.max(1, Number((r.summary as { cuentas?: number } | null)?.cuentas ?? 1)));
  return out;
}

/** Ingreso cobrado desde una fecha, por cliente (centavos; se asume MXN, el costo se convierte con el tipo de cambio configurado). */
export async function incomeSince(since: Date, userId?: string): Promise<Map<string, number>> {
  const rows = await db()
    .select({ userId: payments.userId, cents: sql<number>`coalesce(sum(${payments.amountCents}),0)::bigint` })
    .from(payments)
    .where(and(gte(payments.paidAt, since), userId ? eq(payments.userId, userId) : undefined))
    .groupBy(payments.userId);
  return new Map(rows.map((r) => [r.userId, Number(r.cents)]));
}
