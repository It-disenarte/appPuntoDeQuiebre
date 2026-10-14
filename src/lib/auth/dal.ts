import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE } from "./cookie";
import { validateSessionToken, type SessionUser } from "./session";

/**
 * Capa de acceso a datos de autenticación. TODA página, Server Action y Route Handler
 * protegido debe pasar por aquí; el proxy solo hace una comprobación optimista.
 */
export const getCurrentSession = cache(async (): Promise<{ sessionId: string; user: SessionUser } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

type RequireOptions = {
  /** Permite entrar aunque deba cambiar su contraseña (solo la pantalla de cambio). */
  allowPasswordChange?: boolean;
};

export async function requireUser(opts: RequireOptions = {}): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { user } = session;
  if (user.status === "disabled") redirect("/login?error=desactivada");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/cambiar-contrasena");
  return user;
}

/** Para secciones de administrador. Si no es admin responde 404 (no revela que la ruta existe). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

export function homeFor(user: Pick<SessionUser, "role">): string {
  return user.role === "admin" ? "/admin" : "/hoy";
}
