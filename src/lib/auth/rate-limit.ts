import "server-only";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 25;

/**
 * Reserva un intento de inicio de sesión de forma ATÓMICA.
 *
 * Dentro de una transacción toma candados (pg_advisory_xact_lock) por correo y por IP,
 * cuenta los fallos de la ventana e inserta el intento como fallido ANTES de verificar
 * la contraseña. Así, N peticiones simultáneas se serializan y cada una ve las anteriores:
 * no es posible superar el límite con concurrencia.
 * Orden de candados fijo (correo y luego IP) para evitar interbloqueos.
 *
 * Devuelve el id del intento (para marcarlo exitoso después) o null si está bloqueado.
 */
export async function reserveLoginAttempt(email: string, ip: string | null): Promise<number | null> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"login:email:" + email}))`);
    // Sin IP (no debería pasar detrás de Traefik) todas las peticiones comparten un mismo cupo.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"login:ip:" + (ip ?? "desconocida")}))`);

    const since = new Date(Date.now() - WINDOW_MS);
    const [byEmail] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
    if ((byEmail?.n ?? 0) >= MAX_FAILS_PER_EMAIL) return null;

    const [byIp] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(ip ? eq(loginAttempts.ip, ip) : isNull(loginAttempts.ip), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
    if ((byIp?.n ?? 0) >= MAX_FAILS_PER_IP) return null;

    const [row] = await tx
      .insert(loginAttempts)
      .values({ email: email.slice(0, 254), ip, succeeded: false })
      .returning({ id: loginAttempts.id });
    return row!.id;
  });
}

/** Marca como exitoso un intento reservado (deja de contar como fallo). */
export async function markLoginAttemptSucceeded(attemptId: number): Promise<void> {
  await db().update(loginAttempts).set({ succeeded: true }).where(eq(loginAttempts.id, attemptId));
}
