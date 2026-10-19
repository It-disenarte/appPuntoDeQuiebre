import "server-only";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

/**
 * Cola de trabajos largos en la base de datos. La app encola; el worker (otro servicio) los toma uno por uno con
 * `FOR UPDATE SKIP LOCKED`, así dos workers nunca toman el mismo. Un trabajo "corriendo" que lleva demasiado se considera
 * perdido (el worker murió) y vuelve a la fila hasta agotar sus intentos.
 */
export type JobKind = "metricas.leer" | "analizador.correr" | "coach.revisar";

export const STALE_MS = 15 * 60 * 1000;

export async function enqueue(kind: JobKind, userId: string | null, payload: Record<string, unknown>): Promise<string> {
  const [row] = await db().insert(jobs).values({ kind, userId, payload }).returning({ id: jobs.id });
  return row!.id;
}

export type ClaimedJob = { id: string; kind: string; userId: string | null; payload: unknown; attempts: number };

/** Toma el siguiente trabajo pendiente (o uno perdido). Devuelve null si no hay. */
export async function claimNext(kinds: JobKind[]): Promise<ClaimedJob | null> {
  return db().transaction(async (tx) => {
    const stale = new Date(Date.now() - STALE_MS);
    const [row] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          or(and(eq(jobs.status, "pendiente"), lte(jobs.runAfter, new Date())), and(eq(jobs.status, "corriendo"), lte(jobs.lockedAt, stale))),
          inArray(jobs.kind, kinds),
        ),
      )
      .orderBy(asc(jobs.createdAt))
      .for("update", { skipLocked: true })
      .limit(1);
    if (!row) return null;
    if (row.attempts >= row.maxAttempts) {
      await tx.update(jobs).set({ status: "error", error: row.error ?? "Se agotaron los intentos" }).where(eq(jobs.id, row.id));
      return null;
    }
    await tx.update(jobs).set({ status: "corriendo", lockedAt: new Date(), attempts: row.attempts + 1 }).where(eq(jobs.id, row.id));
    return { id: row.id, kind: row.kind, userId: row.userId, payload: row.payload, attempts: row.attempts + 1 };
  });
}

export const completeJob = (id: string) => db().update(jobs).set({ status: "lista", lockedAt: null, error: null }).where(eq(jobs.id, id));

/** Si quedan intentos vuelve a la fila (con espera); si no, queda en error. */
export async function failJob(id: string, message: string, retry = true): Promise<void> {
  const [row] = await db().select({ attempts: jobs.attempts, max: jobs.maxAttempts }).from(jobs).where(eq(jobs.id, id)).limit(1);
  const again = retry && row && row.attempts < row.max;
  await db()
    .update(jobs)
    .set({ status: again ? "pendiente" : "error", lockedAt: null, error: message.slice(0, 500), runAfter: new Date(Date.now() + (again ? 60_000 : 0)) })
    .where(eq(jobs.id, id));
}

/** Latido: un trabajo largo renueva su marca para que no se le dé por perdido mientras sigue corriendo. */
export const touchJob = (id: string) => db().update(jobs).set({ lockedAt: new Date() }).where(and(eq(jobs.id, id), eq(jobs.status, "corriendo")));
