import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasCreatorAccess } from "@/lib/billing/access";
import { getAccess, type AccessInfo } from "@/lib/billing/service";
import { db } from "@/lib/db";
import { commitments } from "@/lib/db/schema";
import { getApiUser, requireUser } from "./dal";
import type { SessionUser } from "./session";

/** Acceso por pago, cacheado por petición (layout + página no consultan dos veces). */
export const getAccessCached = cache((userId: string) => getAccess(userId));

export const hasAcceptedCommitment = cache(async (userId: string): Promise<boolean> => {
  const [row] = await db().select({ userId: commitments.userId }).from(commitments).where(eq(commitments.userId, userId)).limit(1);
  return Boolean(row);
});

const ADMIN_ACCESS: AccessInfo = { state: "active", subscription: null, graceEndsAt: null };

/**
 * Candado de la app de creador: sesión válida + suscripción con acceso (o en gracia)
 * + compromiso aceptado. Los admins pasan siempre (vista previa).
 */
export async function requireCreatorAccess(): Promise<{ user: SessionUser; access: AccessInfo }> {
  const user = await requireUser();
  if (user.role === "admin") return { user, access: ADMIN_ACCESS };
  const access = await getAccessCached(user.id);
  if (!hasCreatorAccess(access.state)) redirect("/suscripcion");
  if (!(await hasAcceptedCommitment(user.id))) redirect("/bienvenida");
  return { user, access };
}

/** Para la pantalla de compromiso: requiere pago, pero todavía no el compromiso. */
export async function requirePaidUser(): Promise<{ user: SessionUser; access: AccessInfo }> {
  const user = await requireUser();
  if (user.role === "admin") return { user, access: ADMIN_ACCESS };
  const access = await getAccessCached(user.id);
  if (!hasCreatorAccess(access.state)) redirect("/suscripcion");
  return { user, access };
}

/**
 * Para Route Handlers del creador (sin redirecciones): sesión válida con acceso pagado y compromiso aceptado.
 * Los admins pasan. Devuelve null si no corresponde.
 */
export async function getApiCreator(): Promise<SessionUser | null> {
  const user = await getApiUser();
  if (!user) return null;
  if (user.role === "admin") return user;
  const access = await getAccessCached(user.id);
  if (!hasCreatorAccess(access.state)) return null;
  return (await hasAcceptedCommitment(user.id)) ? user : null;
}
