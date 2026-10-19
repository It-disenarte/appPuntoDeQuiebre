/**
 * Worker de tareas en segundo plano (segundo servicio en Easypanel, misma imagen Docker).
 * Usa pg-boss: la cola vive en el esquema "pgboss" del mismo Postgres.
 *
 * Fase 0: solo mantenimiento (sesiones vencidas, intentos de inicio de sesión de más de 30 días
 * y bitácora de auditoría más vieja que AUDIT_RETENTION_DAYS).
 * Fase 1: cada hora libera reservas de códigos abandonadas (si no llegó el webhook de expiración).
 * Fases siguientes: recordatorios Web Push, transcripción, analizador, guiones, métricas, racha.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgBoss } from "pg-boss";
import postgres from "postgres";
import { auditLog, loginAttempts, promoCodes, promoRedemptions, rateEvents, sessions } from "@/lib/db/schema";
import { recordError } from "@/lib/errors";
import { runReview } from "@/lib/coach/service";
import { runJoin } from "@/lib/recording/join";
import { runAnalyzer } from "@/lib/analyzer/service";
import { claimNext, completeJob, failJob, touchJob, type ClaimedJob, type JobKind } from "@/lib/jobs";
import { runExtraction } from "@/lib/metrics/service";
import { refreshExpiringTokens, syncAll } from "@/lib/instagram/service";
import { refreshTrends } from "@/lib/trends/list";
import { tickNotifications } from "@/lib/notify/service";

// El worker comparte el código de la app, que valida TODAS las variables al primer uso. Aquí no cobra ni recibe peticiones:
// APP_URL no hace falta y las llaves de Stripe se ignoran (un valor mal puesto no debe tumbar los trabajos).
process.env.APP_URL ||= process.env.APP_URL_FALLBACK || "http://localhost:3000";
for (const k of Object.keys(process.env)) if (k.startsWith("STRIPE_")) delete process.env[k];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[worker] Falta DATABASE_URL");
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const auditRetentionDays = Math.max(30, Number(process.env.AUDIT_RETENTION_DAYS ?? 365) || 365);
const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 3) || 3;
const sqlClient = postgres(url, { max: Math.min(poolMax, 3), onnotice: () => {} });
const db = drizzle(sqlClient, { casing: "snake_case" });

export const QUEUES = {
  cleanup: "maintenance-cleanup",
  releaseReservations: "billing-release-reservations",
  notifyTick: "notify-tick",
  trendsDaily: "trends-daily",
  instagramDaily: "instagram-daily",
} as const;

/** Trabajos largos que encola la app (tabla `jobs`). Cada tipo tiene su propio ciclo para que uno lento no bloquee a los demás. */
const JOB_HANDLERS: Record<string, (job: ClaimedJob) => Promise<void>> = {
  "metricas.leer": async (job) => {
    const p = job.payload as { period?: string };
    if (!job.userId || !p.period) throw new Error("Trabajo sin usuario o periodo");
    await runExtraction(job.userId, p.period);
  },
  "video.unir": async (job) => {
    const p = job.payload as { pieceId?: string };
    if (!job.userId || !p.pieceId) throw new Error("Trabajo sin usuario o pieza");
    await runJoin(job.userId, p.pieceId);
  },
  "coach.revisar": async (job) => {
    const p = job.payload as { reviewId?: string };
    if (!job.userId || !p.reviewId) throw new Error("Trabajo sin usuario o revisión");
    await runReview(job.userId, p.reviewId);
  },
  "analizador.correr": async (job) => {
    const p = job.payload as { runId?: string };
    if (!job.userId || !p.runId) throw new Error("Trabajo sin usuario o corrida");
    await runAnalyzer(job.userId, p.runId);
  },
};

async function jobLoop(kind: JobKind, everyMs: number, stop: { value: boolean }) {
  while (!stop.value) {
    try {
      const job = await claimNext([kind]);
      if (!job) {
        await new Promise((r) => setTimeout(r, everyMs));
        continue;
      }
      const handler = JOB_HANDLERS[job.kind];
      const beat = setInterval(() => void touchJob(job.id).catch(() => undefined), 60_000);
      try {
        if (!handler) throw new Error(`Sin manejador para ${job.kind}`);
        await handler(job);
        await completeJob(job.id);
      } catch (err) {
        console.error(`[worker] el trabajo ${job.kind} falló`, err instanceof Error ? err.message : err);
        await failJob(job.id, err instanceof Error ? err.message : "Error desconocido");
        await recordError({ source: "trabajo", message: `${job.kind}: ${err instanceof Error ? err.message : "Error desconocido"}` });
      } finally {
        clearInterval(beat);
      }
    } catch (err) {
      console.error("[worker] error en el ciclo de trabajos", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, everyMs * 3));
    }
  }
}

async function cleanup() {
  const now = new Date();
  const expired = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const attempts = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(now.getTime() - 30 * DAY_MS)))
    .returning({ id: loginAttempts.id });
  const audits = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, new Date(now.getTime() - auditRetentionDays * DAY_MS)))
    .returning({ id: auditLog.id });
  const rates = await db
    .delete(rateEvents)
    .where(lt(rateEvents.createdAt, new Date(now.getTime() - 2 * DAY_MS)))
    .returning({ id: rateEvents.id });
  const meta = { sessions: expired.length, loginAttempts: attempts.length, auditLog: audits.length, rateEvents: rates.length };
  await db.insert(auditLog).values({ action: "worker.cleanup", meta });
  console.log("[worker] limpieza", meta);
}

/** Reservas de más de 2 h sin completarse: el checkout de Stripe expira a los 31 min. */
async function releaseReservations() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  let released = 0;
  await db.transaction(async (tx) => {
    const stale = await tx
      .update(promoRedemptions)
      .set({ status: "released" })
      .where(and(eq(promoRedemptions.status, "reserved"), lt(promoRedemptions.createdAt, cutoff)))
      .returning({ codeId: promoRedemptions.codeId });
    for (const r of stale) {
      await tx.update(promoCodes).set({ uses: sql`greatest(${promoCodes.uses} - 1, 0)` }).where(eq(promoCodes.id, r.codeId));
    }
    released = stale.length;
  });
  if (released > 0) console.log("[worker] reservas liberadas", released);
}

async function main() {
  const boss = new PgBoss({ connectionString: url, schema: "pgboss", max: Math.min(poolMax, 5) });
  boss.on("error", (err) => console.error("[worker] pg-boss", err));
  await boss.start();

  await boss.createQueue(QUEUES.cleanup);
  // Todos los días a las 4:00 a. m. hora de la Ciudad de México.
  await boss.schedule(QUEUES.cleanup, "0 4 * * *", null, { tz: "America/Mexico_City" });
  await boss.work(QUEUES.cleanup, async () => {
    await cleanup();
  });

  await boss.createQueue(QUEUES.releaseReservations);
  await boss.schedule(QUEUES.releaseReservations, "17 * * * *", null, { tz: "America/Mexico_City" });
  await boss.work(QUEUES.releaseReservations, async () => {
    await releaseReservations();
  });

  // Avisos (Web Push): cada 5 minutos se revisa a quién le toca algo.
  await boss.createQueue(QUEUES.notifyTick);
  await boss.schedule(QUEUES.notifyTick, "*/5 * * * *", null, { tz: "America/Mexico_City" });
  await boss.work(QUEUES.notifyTick, async () => {
    const r = await tickNotifications();
    if (r.sent > 0) console.log("[worker] avisos enviados", r);
  });

  // Tendencias de TikTok: la lista se baja 1 vez al día (6:00 a. m. de México) y es la misma para todos los creadores.
  await boss.createQueue(QUEUES.trendsDaily);
  await boss.schedule(QUEUES.trendsDaily, "0 6 * * *", null, { tz: "America/Mexico_City" });
  await boss.work(QUEUES.trendsDaily, async () => {
    const r = await refreshTrends();
    console.log("[worker] tendencias actualizadas", r);
  });

  // Instagram: cada día se renuevan los permisos que vencen pronto y se actualizan los datos de las cuentas conectadas.
  await boss.createQueue(QUEUES.instagramDaily);
  await boss.schedule(QUEUES.instagramDaily, "30 5 * * *", null, { tz: "America/Mexico_City" });
  await boss.work(QUEUES.instagramDaily, async () => {
    const tokens = await refreshExpiringTokens();
    const sync = await syncAll();
    console.log("[worker] instagram", { tokens, sync });
  });

  const stopJobs = { value: false };
  void jobLoop("metricas.leer", 4000, stopJobs);
  for (const kind of Object.keys(JOB_HANDLERS)) if (kind !== "metricas.leer") void jobLoop(kind as JobKind, 5000, stopJobs);

  console.log("[worker] listo");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal}: deteniendo…`);
    stopJobs.value = true;
    await boss.stop({ graceful: true, timeout: 20_000 });
    await sqlClient.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] error fatal", err);
  process.exit(1);
});
