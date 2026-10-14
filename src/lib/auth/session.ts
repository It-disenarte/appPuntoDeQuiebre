import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, type User } from "@/lib/db/schema";
import { SESSION_DAYS } from "./cookie";
import { generateSessionToken, hashSessionToken, isWellFormedToken } from "./tokens";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Si a la sesión le quedan menos de estos días, se extiende (sesión deslizante). */
const RENEW_THRESHOLD_DAYS = 15;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "status" | "mustChangePassword">;

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db()
    .insert(sessions)
    .values({
      id: hashSessionToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip ?? null,
    });
  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string,
): Promise<{ sessionId: string; user: SessionUser } | null> {
  if (!isWellFormedToken(token)) return null;
  const id = hashSessionToken(token);
  const [row] = await db()
    .select({
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.expiresAt.getTime() - now < RENEW_THRESHOLD_DAYS * DAY_MS) {
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(now + SESSION_DAYS * DAY_MS), lastSeenAt: new Date(now) })
      .where(eq(sessions.id, id));
  }
  return { sessionId: id, user: row.user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.id, sessionId));
}

/** Cierra todas las sesiones del usuario, opcionalmente conservando una. */
export async function invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db()
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}
