/**
 * Worker de tareas en segundo plano (segundo servicio en Easypanel, misma imagen Docker).
 * Usa pg-boss: la cola vive en el esquema "pgboss" del mismo Postgres.
 *
 * Fase 0: solo mantenimiento (sesiones vencidas, intentos de inicio de sesión de más de 30 días
 * y bitácora de auditoría más vieja que AUDIT_RETENTION_DAYS).
 * Fases siguientes: recordatorios Web Push, transcripción, analizador, guiones, métricas, racha.
 */
import { lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgBoss } from "pg-boss";
import postgres from "postgres";
import { auditLog, loginAttempts, sessions } from "@/lib/db/schema";

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
} as const;

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
  const meta = { sessions: expired.length, loginAttempts: attempts.length, auditLog: audits.length };
  await db.insert(auditLog).values({ action: "worker.cleanup", meta });
  console.log("[worker] limpieza", meta);
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

  console.log("[worker] listo");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal}: deteniendo…`);
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
