"use server";

import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getClientIp, getUserAgent, safeRedirectPath } from "@/lib/request";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookie";
import { getCurrentSession, homeFor } from "./dal";
import { checkPasswordPolicy, hashPassword, PASSWORD_MAX, verifyAgainstDummy, verifyPassword } from "./password";
import { isLoginBlocked, recordLoginAttempt } from "./rate-limit";
import { createSession, invalidateSession, invalidateUserSessions } from "./session";

export type FormState = { error?: string; ok?: boolean } | undefined;

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
  next: z.string().optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };
  const { email, password, next } = parsed.data;
  const ip = await getClientIp();

  if (await isLoginBlocked(email, ip)) {
    await audit({ action: "auth.login_blocked", ip, meta: { email } });
    return { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." };
  }

  const [user] = await db()
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
  if (!user || !valid) {
    await recordLoginAttempt(email, ip, false);
    await audit({ action: "auth.login_failed", targetUserId: user?.id, ip, meta: { email } });
    return { error: GENERIC_LOGIN_ERROR };
  }
  if (user.status === "disabled") {
    await recordLoginAttempt(email, ip, false);
    return { error: "Tu cuenta está desactivada. Escríbenos para reactivarla." };
  }

  await recordLoginAttempt(email, ip, true);

  // Rotación: cualquier sesión previa en este navegador se descarta (evita fijación de sesión).
  const previous = await getCurrentSession();
  if (previous) await invalidateSession(previous.sessionId);

  const { token } = await createSession(user.id, { ip, userAgent: await getUserAgent() });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit({ action: "auth.login", actorUserId: user.id, ip });

  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  redirect(safeRedirectPath(next, homeFor(user)));
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    await invalidateSession(session.sessionId);
    await audit({ action: "auth.logout", actorUserId: session.user.id, ip: await getClientIp() });
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

const changeSchema = z.object({
  current: z.string().min(1).max(PASSWORD_MAX),
  password: z.string().max(PASSWORD_MAX),
  confirm: z.string().max(PASSWORD_MAX),
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const parsed = changeSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: "Revisa los campos." };
  const { current, password, confirm } = parsed.data;

  if (password !== confirm) return { error: "Las contraseñas nuevas no coinciden." };
  if (password === current) return { error: "La nueva contraseña debe ser distinta a la actual." };
  const policyError = checkPasswordPolicy(password, session.user.email);
  if (policyError) return { error: policyError };

  const [row] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row || !(await verifyPassword(row.passwordHash, current))) {
    return { error: "Tu contraseña actual no es correcta." };
  }

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: false })
    .where(eq(users.id, session.user.id));

  // Cierra las demás sesiones abiertas (otros dispositivos) y rota la actual.
  await invalidateUserSessions(session.user.id);
  const ip = await getClientIp();
  const { token } = await createSession(session.user.id, { ip, userAgent: await getUserAgent() });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  await audit({ action: "auth.password_changed", actorUserId: session.user.id, targetUserId: session.user.id, ip });

  redirect(homeFor(session.user));
}
