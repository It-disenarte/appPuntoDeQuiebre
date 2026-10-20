import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appErrors } from "@/lib/db/schema";

export type ErrorSource = "pagina" | "trabajo" | "ia" | "webhook";

/** Quita lo que cambia entre repeticiones del mismo error (ids, números, direcciones) para agruparlos. */
export function normalize(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
export const signatureOf = (source: string, message: string, path?: string | null) => createHash("sha1").update(`${source}|${path ?? ""}|${normalize(message)}`).digest("hex");

/** Un error se considera “seguido” si pasó 3 veces o más en la última hora. */
export const REPEAT_THRESHOLD = 3;

/** ¿El error se está repitiendo ahora? (3 o más veces en la última hora, la última hace menos de una hora) */
export const isRepeating = (e: { lastAt: Date; recentCount: number }, now = new Date()) => e.lastAt.getTime() >= now.getTime() - 60 * 60 * 1000 && e.recentCount >= REPEAT_THRESHOLD;

/**
 * Registra un error del sistema. Nunca lanza: si no se puede guardar, solo queda en los logs. Se guarda el texto del error
 * (recortado), nunca datos del usuario.
 */
export async function recordError(e: { source: ErrorSource; message: string; path?: string | null }): Promise<void> {
  try {
    const message = e.message.replace(/\s+/g, " ").slice(0, 300) || "Error sin mensaje";
    const path = e.path ? e.path.split("?")[0]!.slice(0, 120) : null;
    const signature = signatureOf(e.source, message, path);
    // Como texto con tipo explícito: el cliente de Postgres del worker no acepta un Date suelto dentro de un fragmento sql.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db()
      .insert(appErrors)
      .values({ source: e.source, signature, message, path })
      .onConflictDoUpdate({
        target: appErrors.signature,
        set: {
          count: sql`${appErrors.count} + 1`,
          recentCount: sql`case when ${appErrors.lastAt} >= ${hourAgo}::timestamptz then ${appErrors.recentCount} + 1 else 1 end`,
          resolved: false,
          lastAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[errores] no se pudo registrar", err instanceof Error ? err.message : err);
  }
}

export async function listErrors(opts: { resolved?: boolean; limit?: number } = {}) {
  return db()
    .select()
    .from(appErrors)
    .where(opts.resolved === undefined ? undefined : eq(appErrors.resolved, opts.resolved))
    .orderBy(desc(appErrors.lastAt))
    .limit(opts.limit ?? 100);
}

/** Cuántos errores sin atender hubo en las últimas 24 h y cuántos se repiten (3 o más en la última hora). */
export async function errorSummary(now = new Date()): Promise<{ open: number; repeating: number }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const rows = await db().select({ recent: appErrors.recentCount, last: appErrors.lastAt }).from(appErrors).where(and(eq(appErrors.resolved, false), gte(appErrors.lastAt, since)));
  return { open: rows.length, repeating: rows.filter((r) => r.last >= hourAgo && r.recent >= REPEAT_THRESHOLD).length };
}

export async function resolveError(id: string): Promise<void> {
  await db().update(appErrors).set({ resolved: true, count: 0, recentCount: 0 }).where(eq(appErrors.id, id));
}
export async function resolveAll(): Promise<void> {
  await db().update(appErrors).set({ resolved: true, count: 0, recentCount: 0 }).where(eq(appErrors.resolved, false));
}
