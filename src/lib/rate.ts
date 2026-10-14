import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateEvents } from "@/lib/db/schema";

/**
 * Límite de frecuencia genérico y atómico. Devuelve true si se permite (y registra el evento),
 * false si el bucket ya llegó a `max` en la ventana. Usa un candado por bucket para que
 * peticiones simultáneas no superen el límite.
 *
 * Ejemplos de bucket: "registro:ip:203.0.113.7", "checkout:user:<uuid>".
 */
export async function rateLimit(bucket: string, max: number, windowMs: number): Promise<boolean> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"rate:" + bucket}))`);
    const [row] = await tx
      .select({ n: count() })
      .from(rateEvents)
      .where(and(eq(rateEvents.bucket, bucket), gt(rateEvents.createdAt, new Date(Date.now() - windowMs))));
    if ((row?.n ?? 0) >= max) return false;
    await tx.insert(rateEvents).values({ bucket });
    return true;
  });
}

export const HOUR = 60 * 60 * 1000;
