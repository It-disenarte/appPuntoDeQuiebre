import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 25;

/** true si el correo o la IP superaron el número de intentos fallidos en la ventana. */
export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail] = await db()
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  if ((byEmail?.n ?? 0) >= MAX_FAILS_PER_EMAIL) return true;
  if (!ip) return false;
  const [byIp] = await db()
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  return (byIp?.n ?? 0) >= MAX_FAILS_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string | null, succeeded: boolean): Promise<void> {
  await db().insert(loginAttempts).values({ email: email.slice(0, 254), ip, succeeded });
}
