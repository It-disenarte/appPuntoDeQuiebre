"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { requireUser } from "@/lib/auth/dal";
import { requirePaidUser } from "@/lib/auth/gates";
import { checkPasswordPolicy, hashPassword, PASSWORD_MAX } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { normalizeCode } from "@/lib/billing/promo";
import { openPortal, startCheckout } from "@/lib/billing/service";
import { COMMITMENT_VERSION } from "@/lib/commitment";
import { db } from "@/lib/db";
import { commitments, invoiceRequests, payments, users } from "@/lib/db/schema";
import { TERMS_VERSION } from "@/lib/legal";
import { isPlanId } from "@/lib/plans";
import { HOUR, rateLimit } from "@/lib/rate";
import { getClientIp, getUserAgent } from "@/lib/request";
import { ageFromBirthDate, MAX_AGE, MIN_AGE, REGIMENES_FISCALES, RFC_REGEX, USOS_CFDI } from "@/lib/validation";

export type ActionState = { error?: string; ok?: boolean; fields?: Record<string, string>; wrong?: string[] } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/* ───────────── Registro ───────────── */

const registerSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre.").max(80, "El nombre es muy largo."),
  email: z.string().trim().toLowerCase().email("Revisa tu correo.").max(254),
  password: z.string().max(PASSWORD_MAX),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escribe tu fecha de nacimiento."),
  terms: z.literal("on", { message: "Debes aceptar los términos y el aviso de privacidad." }),
  code: z.string().max(40).optional(),
});

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const fields = { name: str(fd, "name").slice(0, 80), email: str(fd, "email").slice(0, 254), birthDate: str(fd, "birthDate").slice(0, 10), code: str(fd, "code").slice(0, 40) };
  const parsed = registerSchema.safeParse({
    name: fd.get("name"),
    email: fd.get("email"),
    password: fd.get("password"),
    birthDate: fd.get("birthDate"),
    terms: fd.get("terms") ?? undefined,
    code: fd.get("code") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos.", fields };
  const d = parsed.data;

  const age = ageFromBirthDate(d.birthDate);
  if (age === null || age > MAX_AGE) return { error: "Revisa tu fecha de nacimiento.", fields };
  if (age < MIN_AGE) return { error: "La app es solo para mayores de 18 años.", fields };
  const policy = checkPasswordPolicy(d.password, d.email);
  if (policy) return { error: policy, fields };

  const ip = await getClientIp();
  if (!(await rateLimit(`registro:ip:${ip ?? "desconocida"}`, 5, HOUR))) {
    return { error: "Demasiados registros desde tu conexión. Intenta en una hora.", fields };
  }

  const passwordHash = await hashPassword(d.password);
  let userId: string;
  try {
    const [created] = await db()
      .insert(users)
      .values({ email: d.email, name: d.name, passwordHash, birthDate: d.birthDate, termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() })
      .returning({ id: users.id });
    userId = created!.id;
  } catch (err) {
    if ((err as { code?: string; cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { error: "Ya existe una cuenta con ese correo. Inicia sesión.", fields };
    }
    throw err;
  }

  const { token } = await createSession(userId, { ip, userAgent: await getUserAgent() });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  await audit({ action: "auth.registered", actorUserId: userId, ip, meta: { termsVersion: TERMS_VERSION } });

  const code = d.code ? normalizeCode(d.code) : null;
  redirect(code ? `/suscripcion?codigo=${encodeURIComponent(code)}` : "/suscripcion");
}

/* ───────────── Suscripción ───────────── */

export async function checkoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "admin") return { error: "Las cuentas de administrador no se suscriben." };
  const plan = fd.get("plan");
  const rawCode = str(fd, "code").trim();
  if (!isPlanId(plan)) return { error: "Elige un plan." };
  if (!(await rateLimit(`checkout:user:${user.id}`, 10, HOUR))) return { error: "Demasiados intentos. Espera unos minutos." };

  const result = await startCheckout(user, plan, rawCode || null);
  if (!result.ok) return { error: result.error, fields: { code: rawCode.slice(0, 40) } };
  await audit({ action: "billing.checkout_started", actorUserId: user.id, meta: { plan, withCode: Boolean(rawCode) } });
  redirect(result.url);
}

export async function portalAction(): Promise<void> {
  const user = await requireUser();
  const url = await openPortal(user.id);
  redirect(url ?? "/suscripcion");
}

/* ───────────── Compromiso ───────────── */

export async function acceptCommitmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requirePaidUser();
  if (fd.get("accept") !== "on") return { error: "Marca “Acepto el compromiso” para continuar." };

  await db().insert(commitments).values({ userId: user.id, contentVersion: COMMITMENT_VERSION, answers: {} }).onConflictDoNothing();
  await audit({ action: "commitment.accepted", actorUserId: user.id, meta: { version: COMMITMENT_VERSION } });
  redirect("/hoy");
}

/* ───────────── Solicitud de factura ───────────── */

const invoiceSchema = z.object({
  rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, "Revisa tu RFC."),
  razonSocial: z.string().trim().min(2, "Escribe tu nombre o razón social.").max(200),
  regimenFiscal: z.string().refine((v) => v in REGIMENES_FISCALES, "Elige tu régimen fiscal."),
  codigoPostal: z.string().trim().regex(/^\d{5}$/, "El código postal tiene 5 dígitos."),
  usoCfdi: z.string().refine((v) => v in USOS_CFDI, "Elige el uso del CFDI."),
  email: z.string().trim().toLowerCase().email("Revisa el correo.").max(254),
  paymentId: z.string().uuid("Elige el pago a facturar."),
  notes: z.string().trim().max(500).optional(),
});

export async function invoiceRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const raw = Object.fromEntries(["rfc", "razonSocial", "regimenFiscal", "codigoPostal", "usoCfdi", "email", "paymentId", "notes"].map((k) => [k, str(fd, k).slice(0, 500)]));
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los campos.", fields: raw };
  const d = parsed.data;

  // El pago debe ser de este usuario.
  const [payment] = await db().select({ id: payments.id }).from(payments).where(and(eq(payments.id, d.paymentId), eq(payments.userId, user.id))).limit(1);
  if (!payment) return { error: "Ese pago no existe.", fields: raw };
  if (!(await rateLimit(`factura:user:${user.id}`, 10, 24 * HOUR))) return { error: "Demasiadas solicitudes hoy.", fields: raw };

  try {
    await db().insert(invoiceRequests).values({ ...d, notes: d.notes || null, userId: user.id });
  } catch (err) {
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { error: "Ya solicitaste factura de ese pago.", fields: raw };
    }
    throw err;
  }
  await audit({ action: "billing.invoice_requested", actorUserId: user.id, meta: { paymentId: d.paymentId } });
  return { ok: true };
}
