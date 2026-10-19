import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getSchedule, getManual } from "@/lib/brujula/service";
import { db } from "@/lib/db";
import { creatorSettings, metricReports, notifications, pushSubscriptions, users } from "@/lib/db/schema";
import { currentStory, getCurrentPlan } from "@/lib/plan/service";
import { addDays, todayIso } from "@/lib/plan/rules";
import { pushConfigured, sendToUser } from "@/lib/push";
import { dueNotifications, localParts, type NotifyContext } from "./rules";

/**
 * Revisa a los usuarios con avisos activados y manda lo que ya toca. Se llama desde el worker cada 5 minutos.
 * La tabla `notifications` es única por (usuario, tipo, referencia): si dos revisiones coinciden, solo una inserta y envía.
 */
export async function tickNotifications(now = new Date(), limit = 300): Promise<{ users: number; sent: number }> {
  if (!pushConfigured()) return { users: 0, sent: 0 };
  const rows = await db()
    .select({ id: users.id, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.id, db().select({ id: pushSubscriptions.userId }).from(pushSubscriptions))))
    .limit(limit);

  let sent = 0;
  for (const u of rows) {
    try {
      const ctx = await buildContext(u.id, u.name, u.createdAt, now);
      for (const n of dueNotifications(ctx)) {
        const inserted = await db().insert(notifications).values({ userId: u.id, kind: n.kind, refKey: n.refKey, title: n.title, body: n.body, url: n.url }).onConflictDoNothing().returning({ id: notifications.id });
        if (inserted.length === 0) continue;
        const r = await sendToUser(u.id, { title: n.title, body: n.body, url: n.url, tag: `${n.kind}-${n.refKey}`, ...(n.actionTitle ? { actionTitle: n.actionTitle } : {}) });
        await db().update(notifications).set({ status: r.sent > 0 ? "enviada" : "fallida" }).where(eq(notifications.id, inserted[0]!.id));
        sent += r.sent > 0 ? 1 : 0;
      }
    } catch (err) {
      console.error("[notify] no se pudo revisar al usuario", u.id, err instanceof Error ? err.message : err);
    }
  }
  return { users: rows.length, sent };
}

async function buildContext(userId: string, name: string, createdAt: Date, now: Date): Promise<NotifyContext> {
  const today = localParts(now).date;
  const [schedule, manual, plan, settings, reports] = await Promise.all([
    getSchedule(userId),
    getManual(userId),
    getCurrentPlan(userId, today),
    db().select().from(creatorSettings).where(eq(creatorSettings.userId, userId)).limit(1),
    db().select({ period: metricReports.period }).from(metricReports).where(and(eq(metricReports.userId, userId), eq(metricReports.status, "lista"))).orderBy(desc(metricReports.period)).limit(6),
  ]);
  const story = plan?.stories.find((s) => s.day === today) ?? null;
  const view = story ? currentStory(story) : null;
  return {
    now,
    name,
    accountCreatedAt: createdAt,
    manualApproved: manual?.status === "aprobado",
    blocks: schedule?.acceptedAt ? schedule.result.bloques.map((b) => ({ tipo: b.tipo, dia: b.dia, inicio: b.inicio, fin: b.fin })) : [],
    pieces: (plan?.pieces ?? []).map((p) => ({ id: p.id, day: p.day, publishTime: p.publishTime, topic: p.topic, kind: p.kind, status: p.status })),
    storyToday: story && view && !view.own ? { id: story.id, done: story.done, tipo: view.tipo } : null,
    metricPeriods: reports.map((r) => r.period),
    pausedUntil: settings[0]?.pauseUntil ?? null,
    enabled: settings[0]?.notificationsEnabled ?? true,
  };
}

/* ───────────── Modo pausa ───────────── */

export const MAX_PAUSE_DAYS = 7;

export async function getSettings(userId: string) {
  const [s] = await db().select().from(creatorSettings).where(eq(creatorSettings.userId, userId)).limit(1);
  return s ?? null;
}

/** Activa el modo pausa por `days` días (máximo 7): congela la racha y silencia los avisos. */
export async function startPause(userId: string, days: number, today = todayIso()): Promise<string> {
  const until = addDays(today, Math.max(1, Math.min(MAX_PAUSE_DAYS, Math.floor(days))));
  await db()
    .insert(creatorSettings)
    .values({ userId, pauseUntil: until, pauseStartedAt: new Date() })
    .onConflictDoUpdate({ target: creatorSettings.userId, set: { pauseUntil: until, pauseStartedAt: new Date(), updatedAt: new Date() } });
  return until;
}

export async function endPause(userId: string): Promise<void> {
  await db().update(creatorSettings).set({ pauseUntil: null, updatedAt: new Date() }).where(eq(creatorSettings.userId, userId));
}

export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await db()
    .insert(creatorSettings)
    .values({ userId, notificationsEnabled: enabled })
    .onConflictDoUpdate({ target: creatorSettings.userId, set: { notificationsEnabled: enabled, updatedAt: new Date() } });
}

export const isPaused = (until: string | null | undefined, today = todayIso()) => Boolean(until && until >= today);

export async function recentNotifications(userId: string, limit = 10) {
  return db().select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

