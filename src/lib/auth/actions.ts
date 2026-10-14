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
import { markLoginAttemptSucceeded, reserveLoginAttempt } from "./rate-limit";
import { createSession, invalidateSession, invalidateUserSessions } from "./session";

/** `email` se devuelve para volver a llenar el campo: React 19 limpia el formulario tras cada envío. */
export type FormState = { error?: string; ok?: boolean; email?: string } | undefined;

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
  const typedEmail = typeof formData.get("email") === "string" ? String(formData.get("email")).slice(0, 254) : "";
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, email: typedEmail };
  const { email, password, next } = parsed.data;
  const ip = await getClientIp();

  // Reserva atómica: el intento cuenta como fallido hasta que se confirme la contraseña.
  const attemptId = await reserveLoginAttempt(email, ip);
  if (attemptId === null) {
    await audit({ action: "auth.login_blocked", ip });
    return { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", email };
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
  // La bitácora no guarda el correo escrito (dato personal): solo el usuario si existe.
  // Una cuenta desactivada recibe el mismo mensaje genérico para no revelar que existe.
  if (!user || !valid || user.status === "disabled") {
    await audit({
      action: "auth.login_failed",
      targetUserId: user?.id,
      ip,
      meta: user && valid ? { reason: "disabled" } : undefined,
    });
    return { error: GENERIC_LOGIN_ERROR, email };
  }

  await markLoginAttemptSucceeded(attemptId);

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
